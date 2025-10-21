import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CreditCard, DollarSign, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface UnpaidOrder {
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerPO?: string;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
}

interface SelectedPayment {
  orderId: string;
  amount: number;
  orderTotal: number;
}

export default function BulkPaymentPage() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedOrders, setSelectedOrders] = useState<Map<string, { amount: number; total: number }>>(new Map());
  const [paymentType, setPaymentType] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  const {
    data: unpaidOrders = [],
    isLoading: loadingOrders,
    refetch: refetchUnpaidOrders,
  } = useQuery({
    queryKey: ['/api/orders/unpaid/customer', selectedCustomerId],
    queryFn: () =>
      apiRequest(`/api/orders/unpaid/customer/${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  });

  const bulkPaymentMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/orders/bulk-payment', {
        method: 'POST',
        body: data,
      }),
    onSuccess: (response) => {
      toast({
        title: 'Payments Recorded',
        description: `Successfully processed ${response.processed} payment(s)${response.failed > 0 ? `, ${response.failed} failed` : ''}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      refetchUnpaidOrders();
      setSelectedOrders(new Map());
      setPaymentType('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process payments.',
        variant: 'destructive',
      });
    },
  });

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedOrders(new Map());
  };

  const handleOrderToggle = (orderId: string, balanceDue: number, orderTotal: number) => {
    const newSelected = new Map(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.set(orderId, { amount: balanceDue, total: orderTotal });
    }
    setSelectedOrders(newSelected);
  };

  const handleAmountChange = (orderId: string, amount: string, orderTotal: number) => {
    const newSelected = new Map(selectedOrders);
    const parsedAmount = parseFloat(amount);
    if (!isNaN(parsedAmount) && parsedAmount >= 0) {
      const existing = newSelected.get(orderId);
      newSelected.set(orderId, { amount: parsedAmount, total: existing?.total || orderTotal });
      setSelectedOrders(newSelected);
    }
  };

  const handleRecordPayments = () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'No Orders Selected',
        description: 'Please select at least one order to pay.',
        variant: 'destructive',
      });
      return;
    }

    if (!paymentType) {
      toast({
        title: 'Missing Payment Type',
        description: 'Please select a payment type.',
        variant: 'destructive',
      });
      return;
    }

    const paymentItems = Array.from(selectedOrders.entries()).map(
      ([orderId, { amount, total }]) => ({
        orderId,
        paymentType,
        paymentAmount: amount,
        paymentDate,
        orderTotal: total,
      })
    );

    bulkPaymentMutation.mutate({ payments: paymentItems });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const totalSelectedAmount = Array.from(selectedOrders.values()).reduce(
    (sum, { amount }) => sum + amount,
    0
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Bulk Payment Processing</h1>
          <p className="text-muted-foreground">
            Record payments for multiple customer orders at once
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Customer Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="customer-select">Select Customer</Label>
            <Select value={selectedCustomerId} onValueChange={handleCustomerChange}>
              <SelectTrigger id="customer-select" data-testid="select-customer">
                <SelectValue placeholder="Choose a customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer: any) => (
                  <SelectItem
                    key={customer.id}
                    value={customer.id}
                    data-testid={`customer-${customer.id}`}
                  >
                    {customer.name || customer.company || `Customer ${customer.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Unpaid Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading unpaid orders...
              </div>
            ) : unpaidOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No unpaid orders found for this customer.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left w-12">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="p-3 text-left">Order ID</th>
                          <th className="p-3 text-left">Order Date</th>
                          <th className="p-3 text-left">Customer PO</th>
                          <th className="p-3 text-right">Total</th>
                          <th className="p-3 text-right">Paid</th>
                          <th className="p-3 text-right">Balance Due</th>
                          <th className="p-3 text-right">Payment Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaidOrders.map((order: UnpaidOrder) => {
                          const isSelected = selectedOrders.has(order.orderId);
                          const paymentAmount = selectedOrders.get(order.orderId)?.amount || 0;

                          return (
                            <tr
                              key={order.orderId}
                              className={`border-b hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                              data-testid={`order-row-${order.orderId}`}
                            >
                              <td className="p-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    handleOrderToggle(order.orderId, order.balanceDue, order.totalAmount)
                                  }
                                  data-testid={`checkbox-${order.orderId}`}
                                />
                              </td>
                              <td className="p-3 font-medium">{order.orderId}</td>
                              <td className="p-3">
                                {new Date(order.orderDate).toLocaleDateString()}
                              </td>
                              <td className="p-3">{order.customerPO || '-'}</td>
                              <td className="p-3 text-right">
                                {formatCurrency(order.totalAmount)}
                              </td>
                              <td className="p-3 text-right text-green-600">
                                {formatCurrency(order.totalPaid)}
                              </td>
                              <td className="p-3 text-right font-semibold text-red-600">
                                {formatCurrency(order.balanceDue)}
                              </td>
                              <td className="p-3">
                                {isSelected ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={paymentAmount}
                                    onChange={(e) =>
                                      handleAmountChange(order.orderId, e.target.value, order.totalAmount)
                                    }
                                    className="w-32 ml-auto"
                                    data-testid={`input-amount-${order.orderId}`}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedOrders.size > 0 && (
                  <Card className="border-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Payment Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="payment-type">Payment Type</Label>
                          <Select value={paymentType} onValueChange={setPaymentType}>
                            <SelectTrigger
                              id="payment-type"
                              data-testid="select-payment-type"
                            >
                              <SelectValue placeholder="Select payment type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit_card">Credit Card</SelectItem>
                              <SelectItem value="agr">AGR</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="ach">ACH</SelectItem>
                              <SelectItem value="aaaa">AAAA</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="payment-date">Payment Date</Label>
                          <Input
                            id="payment-date"
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            data-testid="input-payment-date"
                          />
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-lg font-semibold">
                            Total Payment Amount:
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(totalSelectedAmount)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mb-4">
                          {selectedOrders.size} order(s) selected
                        </div>

                        <Button
                          onClick={handleRecordPayments}
                          className="w-full"
                          size="lg"
                          disabled={bulkPaymentMutation.isPending}
                          data-testid="button-record-payments"
                        >
                          {bulkPaymentMutation.isPending
                            ? 'Processing...'
                            : 'Record Payments'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

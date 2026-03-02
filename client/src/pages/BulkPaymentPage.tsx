import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CreditCard, DollarSign, FileText, CheckCircle, AlertCircle, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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

interface CustomerAddress {
  id: number;
  customerId: string;
  street: string;
  street2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  type: string;
  isDefault: boolean;
}

interface CreditCardData {
  cardNumber: string;
  expirationDate: string;
  cvv: string;
  billingAddress: {
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  customerEmail: string;
}

export default function BulkPaymentPage() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerComboOpen, setCustomerComboOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Map<string, { amount: number; total: number }>>(new Map());
  const [paymentType, setPaymentType] = useState<string>('');
  const [confirmationNumber, setConfirmationNumber] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [creditCardData, setCreditCardData] = useState<CreditCardData>({
    cardNumber: '',
    expirationDate: '',
    cvv: '',
    billingAddress: {
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
    },
    customerEmail: '',
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  const { data: customerDetails } = useQuery({
    queryKey: ['/api/customers', selectedCustomerId],
    queryFn: () => apiRequest(`/api/customers/${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  });

  const { data: customerAddresses = [] } = useQuery<CustomerAddress[]>({
    queryKey: ['/api/customers', selectedCustomerId, 'addresses'],
    queryFn: () => apiRequest(`/api/customers/${selectedCustomerId}/addresses`),
    enabled: !!selectedCustomerId,
  });

  useEffect(() => {
    if (customerAddresses.length > 0) {
      const billingAddr = customerAddresses.find(
        (addr) => addr.type === 'billing' || addr.type === 'both'
      );
      const defaultAddr = customerAddresses.find((addr) => addr.isDefault);
      const address = billingAddr || defaultAddr || customerAddresses[0];

      setCreditCardData(prev => ({
        ...prev,
        customerEmail: customerDetails?.email || '',
        billingAddress: {
          ...prev.billingAddress,
          address: address ? `${address.street}${address.street2 ? ' ' + address.street2 : ''}` : '',
          city: address?.city || '',
          state: address?.state || '',
          zip: address?.zipCode || '',
          country: address?.country === 'United States' ? 'US' : (address?.country || 'US'),
        },
      }));
    }
  }, [customerDetails, customerAddresses]);

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
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      refetchUnpaidOrders();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process payments.',
        variant: 'destructive',
      });
    },
  });

  const liveBulkPaymentMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/payments/bulk-live', {
        method: 'POST',
        body: data,
      }),
    onSuccess: (response) => {
      if (response.success) {
        toast({
          title: 'Payment Successful',
          description: `Transaction ID: ${response.transactionId}. ${response.ordersProcessed} order(s) updated.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
        refetchUnpaidOrders();
        resetForm();
      } else {
        toast({
          title: 'Payment Failed',
          description: response.message || 'Payment processing failed',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Payment Error',
        description: error.message || 'An error occurred while processing payment',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setSelectedOrders(new Map());
    setPaymentType('');
    setConfirmationNumber('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setCreditCardData({
      cardNumber: '',
      expirationDate: '',
      cvv: '',
      billingAddress: {
        address: creditCardData.billingAddress.address,
        city: creditCardData.billingAddress.city,
        state: creditCardData.billingAddress.state,
        zip: creditCardData.billingAddress.zip,
        country: 'US',
      },
      customerEmail: customerDetails?.email || '',
    });
  };

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedOrders(new Map());
    setCreditCardData({
      cardNumber: '',
      expirationDate: '',
      cvv: '',
      billingAddress: {
        address: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
      },
      customerEmail: '',
    });
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
    
    if (amount === '') {
      const existing = newSelected.get(orderId);
      newSelected.set(orderId, { amount: 0, total: existing?.total || orderTotal });
      setSelectedOrders(newSelected);
      return;
    }
    
    const parsedAmount = parseFloat(amount);
    if (!isNaN(parsedAmount) && parsedAmount >= 0) {
      const existing = newSelected.get(orderId);
      newSelected.set(orderId, { amount: parsedAmount, total: existing?.total || orderTotal });
      setSelectedOrders(newSelected);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : v;
  };

  const formatExpirationDate = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
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

    if (paymentType === 'live') {
      if (!creditCardData.cardNumber || creditCardData.cardNumber.length < 13) {
        toast({
          title: 'Invalid Card Number',
          description: 'Please enter a valid credit card number.',
          variant: 'destructive',
        });
        return;
      }
      if (!creditCardData.expirationDate || !/^\d{2}\/\d{2}$/.test(creditCardData.expirationDate)) {
        toast({
          title: 'Invalid Expiration Date',
          description: 'Please enter expiration date in MM/YY format.',
          variant: 'destructive',
        });
        return;
      }
      if (!creditCardData.cvv || creditCardData.cvv.length < 3) {
        toast({
          title: 'Invalid CVV',
          description: 'Please enter a valid CVV.',
          variant: 'destructive',
        });
        return;
      }
      if (!creditCardData.billingAddress.address || !creditCardData.billingAddress.city || 
          !creditCardData.billingAddress.state || !creditCardData.billingAddress.zip) {
        toast({
          title: 'Missing Billing Address',
          description: 'Please complete the billing address.',
          variant: 'destructive',
        });
        return;
      }

      const orderAllocations = Array.from(selectedOrders.entries()).map(
        ([orderId, { amount, total }]) => ({
          orderId,
          amount,
          orderTotal: total,
        })
      );

      liveBulkPaymentMutation.mutate({
        totalAmount: totalSelectedAmount,
        cardNumber: creditCardData.cardNumber,
        expirationDate: creditCardData.expirationDate,
        cvv: creditCardData.cvv,
        billingAddress: creditCardData.billingAddress,
        customerEmail: creditCardData.customerEmail,
        orderAllocations,
      });
    } else {
      const paymentItems = Array.from(selectedOrders.entries()).map(
        ([orderId, { amount, total }]) => ({
          orderId,
          paymentType,
          paymentAmount: amount,
          paymentDate,
          orderTotal: total,
          notes: confirmationNumber || null,
        })
      );

      bulkPaymentMutation.mutate({ payments: paymentItems });
    }
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

  const isProcessing = bulkPaymentMutation.isPending || liveBulkPaymentMutation.isPending;

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
            <Popover open={customerComboOpen} onOpenChange={setCustomerComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerComboOpen}
                  className="w-full justify-between font-normal"
                  id="customer-select"
                  data-testid="select-customer"
                >
                  {selectedCustomerId
                    ? customers.find((c: any) => c.id === selectedCustomerId)?.name ||
                      customers.find((c: any) => c.id === selectedCustomerId)?.company ||
                      "Choose a customer..."
                    : "Choose a customer..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type to search customers..." />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {customers.map((customer: any) => {
                        const displayName = customer.name || customer.company || `Customer ${customer.id}`;
                        return (
                          <CommandItem
                            key={customer.id}
                            value={displayName}
                            onSelect={() => {
                              handleCustomerChange(customer.id);
                              setCustomerComboOpen(false);
                            }}
                            data-testid={`customer-${customer.id}`}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {displayName}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
                                  <div className="flex flex-col items-end gap-1">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={paymentAmount === 0 ? '' : paymentAmount}
                                      onChange={(e) =>
                                        handleAmountChange(order.orderId, e.target.value, order.totalAmount)
                                      }
                                      className="w-32"
                                      data-testid={`input-amount-${order.orderId}`}
                                      placeholder="0.00"
                                    />
                                    {paymentAmount > order.balanceDue && (
                                      <span className="text-xs text-blue-600 dark:text-blue-400">
                                        Credit: {formatCurrency(paymentAmount - order.balanceDue)}
                                      </span>
                                    )}
                                  </div>
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                              <SelectItem value="live">Live (Credit Card)</SelectItem>
                              <SelectItem value="credit_card">Credit Card</SelectItem>
                              <SelectItem value="agr">AGR</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="ach">ACH</SelectItem>
                              <SelectItem value="wire">Wire</SelectItem>
                              <SelectItem value="aaaa">AAAA</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {paymentType !== 'live' && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="confirmation-number">
                                Check # / Confirmation #
                              </Label>
                              <Input
                                id="confirmation-number"
                                type="text"
                                placeholder="Enter check or confirmation number"
                                value={confirmationNumber}
                                onChange={(e) => setConfirmationNumber(e.target.value)}
                                data-testid="input-confirmation-number"
                              />
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
                          </>
                        )}
                      </div>

                      {paymentType === 'live' && (
                        <div className="border-t pt-4 space-y-4">
                          <h3 className="text-lg font-semibold flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Credit Card Information
                          </h3>
                          
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="card-number">Card Number</Label>
                              <Input
                                id="card-number"
                                placeholder="1234 5678 9012 3456"
                                value={formatCardNumber(creditCardData.cardNumber)}
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
                                  setCreditCardData(prev => ({ ...prev, cardNumber: cleaned }));
                                }}
                                maxLength={19}
                                data-testid="input-card-number"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="exp-date">Expiration Date</Label>
                                <Input
                                  id="exp-date"
                                  placeholder="MM/YY"
                                  value={creditCardData.expirationDate}
                                  onChange={(e) => {
                                    const formatted = formatExpirationDate(e.target.value);
                                    setCreditCardData(prev => ({ ...prev, expirationDate: formatted }));
                                  }}
                                  maxLength={5}
                                  data-testid="input-exp-date"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="cvv">CVV</Label>
                                <Input
                                  id="cvv"
                                  placeholder="123"
                                  value={creditCardData.cvv}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '');
                                    setCreditCardData(prev => ({ ...prev, cvv: value }));
                                  }}
                                  maxLength={4}
                                  data-testid="input-cvv"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="border-t pt-4 space-y-4">
                            <h4 className="font-semibold">Billing Address</h4>
                            
                            <div className="space-y-2">
                              <Label htmlFor="address">Street Address</Label>
                              <Input
                                id="address"
                                placeholder="123 Main Street"
                                value={creditCardData.billingAddress.address}
                                onChange={(e) => setCreditCardData(prev => ({
                                  ...prev,
                                  billingAddress: { ...prev.billingAddress, address: e.target.value }
                                }))}
                                data-testid="input-address"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="city">City</Label>
                                <Input
                                  id="city"
                                  placeholder="City"
                                  value={creditCardData.billingAddress.city}
                                  onChange={(e) => setCreditCardData(prev => ({
                                    ...prev,
                                    billingAddress: { ...prev.billingAddress, city: e.target.value }
                                  }))}
                                  data-testid="input-city"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="state">State</Label>
                                <Input
                                  id="state"
                                  placeholder="CA"
                                  maxLength={2}
                                  value={creditCardData.billingAddress.state}
                                  onChange={(e) => setCreditCardData(prev => ({
                                    ...prev,
                                    billingAddress: { ...prev.billingAddress, state: e.target.value.toUpperCase() }
                                  }))}
                                  data-testid="input-state"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="zip">ZIP Code</Label>
                                <Input
                                  id="zip"
                                  placeholder="12345"
                                  value={creditCardData.billingAddress.zip}
                                  onChange={(e) => setCreditCardData(prev => ({
                                    ...prev,
                                    billingAddress: { ...prev.billingAddress, zip: e.target.value }
                                  }))}
                                  data-testid="input-zip"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="customer-email">Customer Email (for receipt)</Label>
                              <Input
                                id="customer-email"
                                type="email"
                                placeholder="customer@example.com"
                                value={creditCardData.customerEmail}
                                onChange={(e) => setCreditCardData(prev => ({ ...prev, customerEmail: e.target.value }))}
                                data-testid="input-customer-email"
                              />
                            </div>
                          </div>

                          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                              <div className="text-sm text-blue-800 dark:text-blue-200">
                                <p className="font-medium">Secure Payment Processing</p>
                                <p>
                                  Your payment information is encrypted and processed securely
                                  through Accept.Blue. We do not store your credit card
                                  information.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

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
                          disabled={isProcessing}
                          data-testid="button-record-payments"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : paymentType === 'live' ? (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Process Live Payment
                            </>
                          ) : (
                            'Record Payments'
                          )}
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

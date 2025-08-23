import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { DollarSign, CreditCard, Banknote, FileText, Building, University } from 'lucide-react';

// Payment method configuration
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote, color: 'bg-green-500' },
  { value: 'check', label: 'Check', icon: FileText, color: 'bg-blue-500' },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard, color: 'bg-purple-500' },
  { value: 'agr', label: 'AGR', icon: Building, color: 'bg-orange-500' },
  { value: 'ach', label: 'ACH', icon: University, color: 'bg-indigo-500' },
];

const batchPaymentSchema = z.object({
  paymentMethod: z.string().min(1, 'Payment method is required'),
  totalAmount: z.number().min(0.01, 'Amount must be greater than 0'),
  notes: z.string().optional(),
  orderAllocations: z.array(z.object({
    orderId: z.string(),
    amount: z.number().min(0, 'Amount cannot be negative'),
  })).min(1, 'At least one order must be selected'),
});

type BatchPaymentFormData = z.infer<typeof batchPaymentSchema>;

interface Order {
  id: string;
  orderId: string;
  customerName?: string;
  orderDate: string;
  dueDate: string;
  status: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingBalance?: number;
}

interface BatchPaymentProps {
  onPaymentSuccess?: () => void;
}

export default function BatchPayment({ onPaymentSuccess }: BatchPaymentProps) {
  const { toast } = useToast();
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [orderAllocations, setOrderAllocations] = useState<Record<string, number>>({});
  const [autoAllocate, setAutoAllocate] = useState(true);

  const form = useForm<BatchPaymentFormData>({
    resolver: zodResolver(batchPaymentSchema),
    defaultValues: {
      paymentMethod: '',
      totalAmount: 0,
      notes: '',
      orderAllocations: [],
    },
  });

  // Fetch unpaid/partially paid orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['/api/orders/unpaid'],
    enabled: true,
  });

  const orders: Order[] = (ordersData as Order[]) || [];

  const batchPaymentMutation = useMutation({
    mutationFn: async (data: BatchPaymentFormData) => {
      return await apiRequest('/api/payments/batch', {
        method: 'POST',
        body: data as any,
      });
    },
    onSuccess: (result) => {
      toast({
        title: "Batch Payment Successful",
        description: `Payment processed for ${result.ordersUpdated} orders`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/unpaid'] });
      onPaymentSuccess?.();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Batch Payment Failed",
        description: error.message || "An error occurred while processing the batch payment",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    form.reset();
    setSelectedOrders(new Set());
    setOrderAllocations({});
  };

  const handleOrderSelection = (orderId: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (checked) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
      const newAllocations = { ...orderAllocations };
      delete newAllocations[orderId];
      setOrderAllocations(newAllocations);
    }
    setSelectedOrders(newSelected);
    updateFormAllocations(newSelected, orderAllocations);
  };

  const handleAllocationChange = (orderId: string, amount: number) => {
    const newAllocations = {
      ...orderAllocations,
      [orderId]: amount,
    };
    setOrderAllocations(newAllocations);
    updateFormAllocations(selectedOrders, newAllocations);
  };

  const updateFormAllocations = (selected: Set<string>, allocations: Record<string, number>) => {
    const orderAllocations = Array.from(selected).map(orderId => ({
      orderId,
      amount: allocations[orderId] || 0,
    }));
    form.setValue('orderAllocations', orderAllocations);
  };

  const handleAutoAllocate = () => {
    const totalAmount = form.getValues('totalAmount');
    if (totalAmount <= 0 || selectedOrders.size === 0) return;

    const selectedOrdersList = Array.from(selectedOrders).map(orderId => 
      orders.find(order => order.orderId === orderId)
    ).filter(Boolean) as Order[];

    let remainingAmount = totalAmount;
    const newAllocations: Record<string, number> = {};

    // Allocate to orders by oldest first, up to their remaining balance
    for (const order of selectedOrdersList.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime())) {
      const remainingBalance = order.remainingBalance || 0;
      const allocation = Math.min(remainingAmount, remainingBalance);
      newAllocations[order.orderId] = allocation;
      remainingAmount -= allocation;
      if (remainingAmount <= 0) break;
    }

    setOrderAllocations(newAllocations);
    updateFormAllocations(selectedOrders, newAllocations);
  };

  const watchedTotalAmount = form.watch('totalAmount');
  const watchedPaymentMethod = form.watch('paymentMethod');

  React.useEffect(() => {
    if (autoAllocate && watchedTotalAmount > 0 && selectedOrders.size > 0) {
      handleAutoAllocate();
    }
  }, [watchedTotalAmount, selectedOrders, autoAllocate]);

  const totalAllocated = Object.values(orderAllocations).reduce((sum, amount) => sum + amount, 0);
  const remainingAmount = watchedTotalAmount - totalAllocated;

  const getPaymentMethodIcon = (method: string) => {
    const config = PAYMENT_METHODS.find(m => m.value === method);
    if (!config) return <DollarSign className="h-4 w-4" />;
    const IconComponent = config.icon;
    return <IconComponent className="h-4 w-4" />;
  };

  const onSubmit = (data: BatchPaymentFormData) => {
    if (totalAllocated !== data.totalAmount) {
      toast({
        title: "Allocation Error",
        description: "Total allocated amount must equal the payment amount",
        variant: "destructive",
      });
      return;
    }
    batchPaymentMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">Loading orders...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Batch Payment Processing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Payment Method and Amount */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => {
                          const IconComponent = method.icon;
                          return (
                            <SelectItem key={method.value} value={method.value}>
                              <div className="flex items-center gap-2">
                                <div className={`p-1 rounded ${method.color} text-white`}>
                                  <IconComponent className="h-3 w-3" />
                                </div>
                                {method.label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Payment Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Payment Summary */}
            {watchedTotalAmount > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center text-sm">
                  <span>Payment Amount:</span>
                  <span className="font-medium">${watchedTotalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Total Allocated:</span>
                  <span className="font-medium">${totalAllocated.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                  <span>Remaining:</span>
                  <span className={`font-medium ${remainingAmount === 0 ? 'text-green-600' : remainingAmount > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                    ${remainingAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Auto-allocate toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-allocate"
                checked={autoAllocate}
                onCheckedChange={(checked) => setAutoAllocate(Boolean(checked))}
              />
              <Label htmlFor="auto-allocate">Auto-allocate to oldest orders first</Label>
              {!autoAllocate && (
                <Button type="button" variant="outline" size="sm" onClick={handleAutoAllocate}>
                  Auto-allocate Now
                </Button>
              )}
            </div>

            {/* Order Selection */}
            <div>
              <Label className="text-base font-medium">Select Orders to Pay</Label>
              <div className="mt-3 space-y-3 max-h-96 overflow-y-auto border rounded-lg p-4">
                {orders.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No unpaid orders found
                  </div>
                ) : (
                  orders.map((order) => (
                    <div key={order.orderId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={selectedOrders.has(order.orderId)}
                          onCheckedChange={(checked) => handleOrderSelection(order.orderId, Boolean(checked))}
                        />
                        <div>
                          <div className="font-medium">{order.orderId}</div>
                          {order.customerName && (
                            <div className="text-sm text-gray-600">{order.customerName}</div>
                          )}
                          <div className="text-xs text-gray-500">
                            Due: {new Date(order.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm">
                            Balance: <span className="font-medium">${(order.remainingBalance || 0).toFixed(2)}</span>
                          </div>
                          <Badge variant={order.status === 'FINALIZED' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </div>
                        {selectedOrders.has(order.orderId) && (
                          <div className="w-24">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={order.remainingBalance || 0}
                              placeholder="Amount"
                              value={orderAllocations[order.orderId] || ''}
                              onChange={(e) => handleAllocationChange(order.orderId, parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this payment..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={batchPaymentMutation.isPending || selectedOrders.size === 0 || remainingAmount !== 0}
                className="flex-1"
              >
                {batchPaymentMutation.isPending ? (
                  'Processing...'
                ) : (
                  <>
                    {getPaymentMethodIcon(watchedPaymentMethod)}
                    <span className="ml-2">
                      Process {watchedPaymentMethod ? PAYMENT_METHODS.find(m => m.value === watchedPaymentMethod)?.label : 'Payment'} 
                      {watchedTotalAmount > 0 && ` - $${watchedTotalAmount.toFixed(2)}`}
                    </span>
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Reset
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
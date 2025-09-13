import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, DollarSign, FileText, User, Calendar, Package } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import { apiRequest } from '@/lib/queryClient';
import type { Customer } from '@shared/schema';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  fbOrderNumber?: string;
  currentDepartment: string;
  status: string;
  modelId: string;
  shipping: number;
  paymentAmount?: number;
  isPaid: boolean;
  paymentTotal: number;
  orderTotal?: number;
  balanceDue?: number;
  isFullyPaid: boolean;
  customerPO?: string;
}

interface RefundRequestData {
  orderId: string;
  customerId: string;
  requestedBy: string;
  refundAmount: number;
  reason: string;
  originalTransactionId?: string;
  notes?: string;
}

export default function RefundRequest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Fetch customer orders when customer is selected
  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/orders/customer', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await apiRequest(`/api/orders/customer/${selectedCustomer.id}`);
      return response as Order[];
    },
    enabled: !!selectedCustomer?.id,
  });

  // Create refund request mutation
  const createRefundRequestMutation = useMutation({
    mutationFn: async (requestData: RefundRequestData) => {
      return await apiRequest('/api/refund-requests', {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Refund Request Submitted',
        description: 'Your refund request has been submitted for approval.',
      });
      // Reset form
      setSelectedOrder(null);
      setRefundAmount('');
      setReason('');
      setNotes('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit refund request',
        variant: 'destructive',
      });
    },
  });

  const handleOrderSelect = (order: Order) => {
    setSelectedOrder(order);
    // Set max refund amount to the order total (matches what's shown in Order Summary)
    setRefundAmount((order.orderTotal || 0).toString());
  };

  const handleSubmitRefund = () => {
    if (!selectedCustomer || !selectedOrder) {
      toast({
        title: 'Error',
        description: 'Please select a customer and order',
        variant: 'destructive',
      });
      return;
    }

    if (!refundAmount || parseFloat(refundAmount) <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid refund amount',
        variant: 'destructive',
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for the refund',
        variant: 'destructive',
      });
      return;
    }

    const requestData: RefundRequestData = {
      orderId: selectedOrder.orderId,
      customerId: selectedCustomer.id.toString(),
      requestedBy: 'CSR', // TODO: Get from authentication context in production
      refundAmount: parseFloat(refundAmount),
      reason: reason.trim(),
      notes: notes.trim() || undefined,
    };

    createRefundRequestMutation.mutate(requestData);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="refund-request-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="page-title">
          Request Refund
        </h1>
        <p className="text-gray-600" data-testid="page-description">
          Search for a customer and select an order to request a refund. All refund requests require manager approval.
        </p>
        <Button 
          className="mt-4 bg-pink-500 hover:bg-pink-600 text-white"
          data-testid="goodbye-button"
        >
          GOODBYE
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Search and Orders */}
        <Card className="lg:col-span-1" data-testid="customer-search-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Customer & Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Search */}
            <CustomerSearchInput
              value={selectedCustomer}
              onValueChange={(customer) => {
                setSelectedCustomer(customer);
                setSelectedOrder(null);
                setRefundAmount('');
              }}
              placeholder="Search for customer..."
              data-testid="customer-search-input"
            />

            {/* Customer Orders */}
            {selectedCustomer && (
              <div className="space-y-3">
                <Label className="text-sm font-medium" data-testid="orders-label">
                  Orders for {selectedCustomer.name}
                </Label>
                
                {ordersLoading ? (
                  <div className="text-center py-4 text-gray-500" data-testid="loading-orders">
                    Loading orders...
                  </div>
                ) : customerOrders.length === 0 ? (
                  <Alert data-testid="no-orders-alert">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No orders found for this customer.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="orders-list">
                    {customerOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => handleOrderSelect(order)}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedOrder?.id === order.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        data-testid={`order-card-${order.orderId}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-medium text-sm" data-testid={`order-id-${order.orderId}`}>
                              {order.orderId}
                              {order.fbOrderNumber && (
                                <span className="text-gray-500 ml-2">
                                  ({order.fbOrderNumber})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500" data-testid={`order-date-${order.orderId}`}>
                              {formatDate(order.orderDate)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-sm" data-testid={`balance-due-${order.orderId}`}>
                              {formatCurrency(order.balanceDue || 0)}
                            </div>
                            <Badge
                              className={order.isFullyPaid ? "bg-green-500 hover:bg-green-600 text-white text-xs" : "bg-red-500 hover:bg-red-600 text-white text-xs"}
                              data-testid={`payment-status-${order.orderId}`}
                            >
                              {order.isFullyPaid ? 'PAID' : 'NOT PAID'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span data-testid={`order-model-${order.orderId}`}>
                            <Package className="h-3 w-3 inline mr-1" />
                            {order.modelId}
                          </span>
                          <span data-testid={`order-status-${order.orderId}`}>
                            {order.currentDepartment}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Refund Request Form */}
        <Card className="lg:col-span-1" data-testid="refund-form-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Refund Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedOrder ? (
              <Alert data-testid="select-order-alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please select a customer and order to request a refund.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Selected Order Summary */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2" data-testid="selected-order-summary">
                  <div className="font-medium text-sm" data-testid="summary-order-id">
                    Order: {selectedOrder.orderId}
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div data-testid="summary-customer">Customer: {selectedCustomer?.name}</div>
                    <div data-testid="summary-date">Date: {formatDate(selectedOrder.orderDate)}</div>
                    <div data-testid="summary-order-total">Order Total: {formatCurrency(selectedOrder.orderTotal || 0)}</div>
                    <div data-testid="summary-total-paid">Total Paid: {formatCurrency(selectedOrder.paymentTotal)}</div>
                    <div data-testid="summary-balance-due" className="font-medium">Balance Due: {formatCurrency(selectedOrder.balanceDue || 0)}</div>
                  </div>
                </div>

                {/* Refund Amount */}
                <div className="space-y-2">
                  <Label htmlFor="refund-amount" data-testid="refund-amount-label">
                    Refund Amount *
                  </Label>
                  <Input
                    id="refund-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedOrder.orderTotal || 0}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                    data-testid="refund-amount-input"
                  />
                  <div className="text-xs text-gray-500" data-testid="max-refund-note">
                    Maximum refund: {formatCurrency(selectedOrder.orderTotal || 0)}
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason" data-testid="reason-label">
                    Reason for Refund *
                  </Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Customer applied discount code SAVE10 after payment..."
                    rows={3}
                    data-testid="reason-input"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes" data-testid="notes-label">
                    Additional Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional information..."
                    rows={2}
                    data-testid="notes-input"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmitRefund}
                  disabled={createRefundRequestMutation.isPending}
                  className="w-full"
                  data-testid="submit-refund-button"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {createRefundRequestMutation.isPending ? 'Submitting...' : 'Submit Refund Request'}
                </Button>

                <Alert data-testid="approval-notice">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This refund request will be sent to management for approval before processing.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
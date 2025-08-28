import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, CreditCard } from 'lucide-react';

export interface Payment {
  id: number;
  orderId: string;
  paymentType: string;
  paymentAmount: number;
  paymentDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentManagerProps {
  orderId: string;
  totalAmount: number;
  onPaymentsChange?: (payments: Payment[]) => void;
  isInline?: boolean;
}

export default function PaymentManager({ orderId, totalAmount, onPaymentsChange, isInline = false }: PaymentManagerProps) {
  const { toast } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  // Form state
  const [paymentType, setPaymentType] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Fetch payments for this order
  const { data: payments = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/orders', orderId, 'payments'],
    queryFn: () => apiRequest(`/api/orders/${orderId}/payments`),
    enabled: !!orderId && orderId !== 'undefined',
  });

  // Calculate totals
  const totalPaid = payments.reduce((sum: number, payment: Payment) => sum + payment.paymentAmount, 0);
  const balanceDue = totalAmount - totalPaid;
  const isCredit = balanceDue < 0;

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/orders/${orderId}/payments`, {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      toast({
        title: "Payment Added",
        description: "Payment has been successfully recorded.",
      });
      refetch();
      resetForm();
      setShowPaymentModal(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment.",
        variant: "destructive",
      });
    },
  });

  // Update payment mutation
  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      apiRequest(`/api/orders/payments/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      toast({
        title: "Payment Updated",
        description: "Payment has been successfully updated.",
      });
      refetch();
      resetForm();
      setShowPaymentModal(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment.",
        variant: "destructive",
      });
    },
  });

  // Delete payment mutation
  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/orders/payments/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      toast({
        title: "Payment Deleted",
        description: "Payment has been successfully removed.",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPaymentType('');
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setEditingPayment(null);
  };

  const handleAddPayment = () => {
    resetForm();
    // Pre-fill with remaining balance if there's one
    if (balanceDue > 0) {
      setPaymentAmount(balanceDue.toFixed(2));
    }
    setShowPaymentModal(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setPaymentType(payment.paymentType);
    setPaymentAmount(payment.paymentAmount.toString());
    setPaymentDate(payment.paymentDate.split('T')[0]);
    setNotes(payment.notes || '');
    setShowPaymentModal(true);
  };

  const handleDeletePayment = (id: number) => {
    if (confirm('Are you sure you want to delete this payment?')) {
      deletePaymentMutation.mutate(id);
    }
  };

  const handleSubmit = () => {
    if (!paymentType || !paymentAmount) {
      toast({
        title: "Missing Information",
        description: "Please select a payment type and enter an amount.",
        variant: "destructive",
      });
      return;
    }

    const paymentData = {
      paymentType,
      paymentAmount: parseFloat(paymentAmount),
      paymentDate: new Date(paymentDate),
      notes: notes.trim() || null,
    };

    if (editingPayment) {
      updatePaymentMutation.mutate({
        id: editingPayment.id,
        data: { ...paymentData, orderId },
      });
    } else {
      createPaymentMutation.mutate({ ...paymentData, orderId });
    }
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Notify parent of payments changes
  useEffect(() => {
    if (onPaymentsChange) {
      onPaymentsChange(payments);
    }
  }, [payments, onPaymentsChange]);

  if (isLoading) {
    return <div>Loading payments...</div>;
  }

  // Inline content for Order Summary integration
  const inlineContent = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="h-5 w-5" />
        <h3 className="font-semibold">Payment Management</h3>
      </div>

      {/* Payment Summary */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-medium">Order Total:</span>
          <span className="font-bold">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-medium">Total Paid:</span>
          <span className="font-bold text-green-600">{formatCurrency(totalPaid)}</span>
        </div>
        <div className="flex justify-between items-center border-t pt-2">
          <span className="font-bold">
            {isCredit ? 'Credit Balance:' : 'Balance Due:'}
          </span>
          <span className={`font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(balanceDue))}
          </span>
        </div>
      </div>

      {/* Payment List */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-medium">Payments ({payments.length})</span>
          <Button onClick={handleAddPayment} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Payment
          </Button>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-2 text-gray-500 text-sm">
            No payments recorded yet
          </div>
        ) : (
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {payments.map((payment: Payment) => (
              <div key={payment.id} className="border rounded p-2 text-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(payment.paymentAmount)}</span>
                    <span className="text-xs text-gray-600">
                      {payment.paymentType.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => handleEditPayment(payment)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeletePayment(payment.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(payment.paymentDate).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isInline) {
    return (
      <>
        {inlineContent}
        {/* Payment Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingPayment ? 'Edit Payment' : 'Add Payment'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Payment Type */}
              <div className="space-y-2">
                <Label htmlFor="payment-type">Payment Type</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
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

              {/* Payment Amount */}
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>

              {/* Payment Date */}
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Payment notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowPaymentModal(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
              >
                {createPaymentMutation.isPending || updatePaymentMutation.isPending
                  ? "Saving..." 
                  : editingPayment 
                    ? "Update Payment" 
                    : "Add Payment"
                }
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Standard card layout
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {inlineContent}

        {/* Payment Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingPayment ? 'Edit Payment' : 'Add Payment'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Payment Type */}
              <div className="space-y-2">
                <Label htmlFor="payment-type">Payment Type</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
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

              {/* Payment Amount */}
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>

              {/* Payment Date */}
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Payment notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowPaymentModal(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
              >
                {createPaymentMutation.isPending || updatePaymentMutation.isPending
                  ? "Saving..." 
                  : editingPayment 
                    ? "Update Payment" 
                    : "Add Payment"
                }
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
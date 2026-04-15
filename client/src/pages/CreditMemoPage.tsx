import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle,
  DollarSign,
  FileText,
  User,
  Calendar,
  Package,
  Plus,
  History,
  CreditCard,
  Check,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Customer } from '@shared/schema';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface CreditMemo {
  id: number;
  memoNumber: string;
  customerId: string;
  amount: number;
  appliedAmount: number;
  unappliedAmount: number;
  reason: string;
  notes?: string;
  status: string;
  issuedDate: string;
  createdBy?: string;
  createdAt: string;
  customerName?: string;
}

interface InvoiceApplication {
  orderId: string;
  amount: number;
  notes?: string;
}

export default function CreditMemoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedOrders, setSelectedOrders] = useState<Map<string, number>>(new Map());
  const [activeTab, setActiveTab] = useState('create');
  const [selectedUnappliedMemo, setSelectedUnappliedMemo] = useState<CreditMemo | null>(null);
  const [applyAmounts, setApplyAmounts] = useState<Map<string, number>>(new Map());

  const urlCustomerId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('customerId')
    : null;

  const { data: preselectedCustomer } = useQuery<Customer>({
    queryKey: ['/api/customers', urlCustomerId],
    queryFn: () => apiRequest(`/api/customers/${urlCustomerId}`),
    enabled: !!urlCustomerId && !selectedCustomer,
  });

  useEffect(() => {
    if (preselectedCustomer && !selectedCustomer) {
      setSelectedCustomer(preselectedCustomer);
      setActiveTab('history');
    }
  }, [preselectedCustomer]);

  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/orders/customer', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await apiRequest(
        `/api/orders/customer/${selectedCustomer.id}`
      );
      return response as Order[];
    },
    enabled: !!selectedCustomer?.id,
  });

  const { data: customerMemos = [], isLoading: memosLoading } = useQuery({
    queryKey: ['/api/credit-memos/customer', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await apiRequest(
        `/api/credit-memos/customer/${selectedCustomer.id}`
      );
      return response as CreditMemo[];
    },
    enabled: !!selectedCustomer?.id,
  });

  const { data: unappliedMemos = [] } = useQuery({
    queryKey: ['/api/credit-memos/customer', selectedCustomer?.id, 'unapplied'],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await apiRequest(
        `/api/credit-memos/customer/${selectedCustomer.id}/unapplied`
      );
      return response as CreditMemo[];
    },
    enabled: !!selectedCustomer?.id,
  });

  const openInvoices = useMemo(() => {
    return customerOrders.filter(order => (order.balanceDue || 0) > 0);
  }, [customerOrders]);

  const createCreditMemoMutation = useMutation({
    mutationFn: async (data: { customerId: string; amount: number; reason: string; notes?: string }) => {
      return await apiRequest('/api/credit-memos', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Credit Memo Created',
        description: `Credit memo ${result.memoNumber} has been created successfully.`,
      });
      setCreditAmount('');
      setReason('');
      setNotes('');
      setSelectedOrders(new Map());
      queryClient.invalidateQueries({ queryKey: ['/api/credit-memos/customer', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-memos/customer', selectedCustomer?.id, 'unapplied'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create credit memo',
        variant: 'destructive',
      });
    },
  });

  const applyCreditMemoMutation = useMutation({
    mutationFn: async (data: { memoId: number; applications: InvoiceApplication[] }) => {
      return await apiRequest(`/api/credit-memos/${data.memoId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ applications: data.applications }),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Credit Applied',
        description: result.message || 'Credit memo applied successfully.',
      });
      setSelectedUnappliedMemo(null);
      setApplyAmounts(new Map());
      queryClient.invalidateQueries({ queryKey: ['/api/credit-memos/customer', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-memos/customer', selectedCustomer?.id, 'unapplied'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/customer', selectedCustomer?.id] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to apply credit memo',
        variant: 'destructive',
      });
    },
  });

  const handleCreateCreditMemo = () => {
    if (!selectedCustomer) {
      toast({
        title: 'Error',
        description: 'Please select a customer',
        variant: 'destructive',
      });
      return;
    }

    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid credit amount',
        variant: 'destructive',
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for the credit memo',
        variant: 'destructive',
      });
      return;
    }

    createCreditMemoMutation.mutate({
      customerId: selectedCustomer.id.toString(),
      amount,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
    });
  };

  const handleApplyCredit = () => {
    if (!selectedUnappliedMemo) {
      toast({
        title: 'Error',
        description: 'Please select a credit memo to apply',
        variant: 'destructive',
      });
      return;
    }

    const applications: InvoiceApplication[] = [];
    let totalApplying = 0;

    applyAmounts.forEach((amount, orderId) => {
      if (amount > 0) {
        applications.push({ orderId, amount });
        totalApplying += amount;
      }
    });

    if (applications.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter amounts to apply to at least one invoice',
        variant: 'destructive',
      });
      return;
    }

    if (totalApplying > selectedUnappliedMemo.unappliedAmount) {
      toast({
        title: 'Error',
        description: `Cannot apply more than the available balance of ${formatCurrency(selectedUnappliedMemo.unappliedAmount)}`,
        variant: 'destructive',
      });
      return;
    }

    applyCreditMemoMutation.mutate({
      memoId: selectedUnappliedMemo.id,
      applications,
    });
  };

  const handleApplyAmountChange = (orderId: string, value: string, maxAmount: number) => {
    const amount = parseFloat(value) || 0;
    const newMap = new Map(applyAmounts);
    if (amount > 0 && amount <= maxAmount) {
      newMap.set(orderId, amount);
    } else if (amount <= 0) {
      newMap.delete(orderId);
    } else {
      newMap.set(orderId, maxAmount);
    }
    setApplyAmounts(newMap);
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

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      active: 'bg-green-500 hover:bg-green-600',
      fully_applied: 'bg-blue-500 hover:bg-blue-600',
      cancelled: 'bg-red-500 hover:bg-red-600',
    };
    return (
      <Badge className={`${statusStyles[status] || 'bg-gray-500'} text-white text-xs`}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const totalApplying = useMemo(() => {
    let total = 0;
    applyAmounts.forEach(amount => {
      total += amount;
    });
    return total;
  }, [applyAmounts]);

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="credit-memo-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2" data-testid="page-title">
          Credit Memo Management
        </h1>
        <p className="text-gray-600 dark:text-gray-400" data-testid="page-description">
          Create credit memos and apply them to open invoices. Credits can be applied immediately without approval.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1" data-testid="customer-search-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Select Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CustomerSearchInput
              value={selectedCustomer}
              onValueChange={(customer) => {
                setSelectedCustomer(customer);
                setSelectedOrders(new Map());
                setCreditAmount('');
                setSelectedUnappliedMemo(null);
                setApplyAmounts(new Map());
              }}
              placeholder="Search for customer..."
              data-testid="customer-search-input"
            />

            {selectedCustomer && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Selected Customer</span>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="font-medium" data-testid="text-selected-customer-name">{selectedCustomer.name}</p>
                  {selectedCustomer.email && (
                    <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Open Invoices:</span>
                    <span className="font-medium" data-testid="text-open-invoices-count">{openInvoices.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Balance Due:</span>
                    <span className="font-medium text-red-600" data-testid="text-total-balance">
                      {formatCurrency(openInvoices.reduce((sum, o) => sum + (o.balanceDue || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Unapplied Credits:</span>
                    <span className="font-medium text-green-600" data-testid="text-unapplied-credits">
                      {formatCurrency(unappliedMemos.reduce((sum, m) => sum + m.unappliedAmount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="credit-memo-content-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Credit Memo Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedCustomer ? (
              <Alert data-testid="select-customer-alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please select a customer to manage credit memos.
                </AlertDescription>
              </Alert>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="create" data-testid="tab-create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Credit
                  </TabsTrigger>
                  <TabsTrigger value="apply" data-testid="tab-apply">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Apply Credit
                  </TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">
                    <History className="h-4 w-4 mr-2" />
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="credit-amount" data-testid="label-credit-amount">
                        Credit Amount *
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="credit-amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          placeholder="0.00"
                          className="pl-10"
                          data-testid="input-credit-amount"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reason" data-testid="label-reason">
                        Reason for Credit *
                      </Label>
                      <Textarea
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Pricing adjustment, product return, service credit..."
                        rows={3}
                        data-testid="input-reason"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes" data-testid="label-notes">
                        Additional Notes
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any additional information..."
                        rows={2}
                        data-testid="input-notes"
                      />
                    </div>

                    <Button
                      onClick={handleCreateCreditMemo}
                      disabled={createCreditMemoMutation.isPending}
                      className="w-full"
                      data-testid="button-create-credit-memo"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {createCreditMemoMutation.isPending ? 'Creating...' : 'Create Credit Memo'}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="apply" className="space-y-4 mt-4">
                  {unappliedMemos.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No unapplied credit memos available for this customer.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label data-testid="label-select-credit-memo">Select Credit Memo to Apply</Label>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {unappliedMemos.map((memo) => (
                            <div
                              key={memo.id}
                              onClick={() => {
                                setSelectedUnappliedMemo(memo);
                                setApplyAmounts(new Map());
                              }}
                              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                selectedUnappliedMemo?.id === memo.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                              }`}
                              data-testid={`credit-memo-option-${memo.id}`}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="font-medium">{memo.memoNumber}</span>
                                  <span className="text-sm text-gray-500 ml-2">
                                    {formatDate(memo.issuedDate)}
                                  </span>
                                </div>
                                <span className="font-medium text-green-600">
                                  {formatCurrency(memo.unappliedAmount)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 mt-1 truncate">{memo.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {selectedUnappliedMemo && (
                        <>
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="font-medium">Available to Apply:</span>
                              <span className="text-lg font-bold text-green-600">
                                {formatCurrency(selectedUnappliedMemo.unappliedAmount)}
                              </span>
                            </div>
                            {totalApplying > 0 && (
                              <div className="flex justify-between items-center mt-2 pt-2 border-t border-green-200">
                                <span className="text-sm">Applying:</span>
                                <span className="font-medium text-blue-600">
                                  {formatCurrency(totalApplying)}
                                </span>
                              </div>
                            )}
                          </div>

                          {openInvoices.length === 0 ? (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                No open invoices to apply credit to. The credit will remain unapplied.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <>
                              <Label>Select Invoices and Enter Amounts</Label>
                              <div className="border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Order</TableHead>
                                      <TableHead>Date</TableHead>
                                      <TableHead className="text-right">Balance Due</TableHead>
                                      <TableHead className="text-right">Apply Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {openInvoices.map((order) => (
                                      <TableRow key={order.orderId}>
                                        <TableCell className="font-medium">
                                          {order.orderId}
                                          {order.fbOrderNumber && (
                                            <span className="text-gray-500 ml-1">({order.fbOrderNumber})</span>
                                          )}
                                        </TableCell>
                                        <TableCell>{formatDate(order.orderDate)}</TableCell>
                                        <TableCell className="text-right text-red-600">
                                          {formatCurrency(order.balanceDue || 0)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max={Math.min(order.balanceDue || 0, selectedUnappliedMemo.unappliedAmount)}
                                            value={applyAmounts.get(order.orderId) || ''}
                                            onChange={(e) => handleApplyAmountChange(
                                              order.orderId,
                                              e.target.value,
                                              Math.min(order.balanceDue || 0, selectedUnappliedMemo.unappliedAmount)
                                            )}
                                            placeholder="0.00"
                                            className="w-28 ml-auto"
                                            data-testid={`input-apply-amount-${order.orderId}`}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </>
                          )}

                          <Button
                            onClick={handleApplyCredit}
                            disabled={applyCreditMemoMutation.isPending || totalApplying <= 0}
                            className="w-full"
                            data-testid="button-apply-credit"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            {applyCreditMemoMutation.isPending
                              ? 'Applying...'
                              : `Apply ${formatCurrency(totalApplying)} Credit`}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {memosLoading ? (
                    <div className="text-center py-8 text-gray-500">
                      Loading credit memo history...
                    </div>
                  ) : customerMemos.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No credit memo history for this customer.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Memo #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Applied</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerMemos.map((memo) => (
                            <TableRow key={memo.id} data-testid={`credit-memo-row-${memo.id}`}>
                              <TableCell className="font-medium">{memo.memoNumber}</TableCell>
                              <TableCell>{formatDate(memo.issuedDate)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(memo.amount)}</TableCell>
                              <TableCell className="text-right text-blue-600">
                                {formatCurrency(memo.appliedAmount)}
                              </TableCell>
                              <TableCell className="text-right text-green-600">
                                {formatCurrency(memo.unappliedAmount)}
                              </TableCell>
                              <TableCell>{getStatusBadge(memo.status)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedCustomer && openInvoices.length > 0 && (
        <Card className="mt-6" data-testid="open-invoices-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Open Invoices for {selectedCustomer.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Order Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openInvoices.map((order) => (
                    <TableRow key={order.orderId} data-testid={`invoice-row-${order.orderId}`}>
                      <TableCell className="font-medium">
                        {order.orderId}
                        {order.fbOrderNumber && (
                          <span className="text-gray-500 ml-1 text-sm">({order.fbOrderNumber})</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(order.orderDate)}</TableCell>
                      <TableCell>{formatDate(order.dueDate)}</TableCell>
                      <TableCell>{order.modelId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.currentDepartment}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(order.orderTotal || 0)}</TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatCurrency(order.paymentTotal || 0)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {formatCurrency(order.balanceDue || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

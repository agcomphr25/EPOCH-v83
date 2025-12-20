import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CreditCard, ChevronDown, ChevronUp, DollarSign, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { format } from 'date-fns';

interface CreditMemo {
  id: number;
  memoNumber: string;
  amount: number;
  unappliedAmount: number;
  reason: string;
  sourceType: string;
  issuedDate: string;
}

interface CreditSummary {
  customerId: string;
  totalAvailableCredits: number;
  activeMemoCount: number;
}

interface CustomerCreditIndicatorProps {
  customerId: string | number | null;
  orderId: string | null;
  orderTotal: number;
  onCreditApplied?: () => void;
}

export default function CustomerCreditIndicator({
  customerId,
  orderId,
  orderTotal,
  onCreditApplied,
}: CustomerCreditIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<CreditMemo | null>(null);
  const [applyAmount, setApplyAmount] = useState('');
  const { toast } = useToast();

  const customerIdStr = customerId?.toString() || '';

  const { data: creditSummary, isLoading: summaryLoading } = useQuery<CreditSummary>({
    queryKey: ['/api/credit-memos/customer', customerIdStr, 'summary'],
    queryFn: () => apiRequest(`/api/credit-memos/customer/${customerIdStr}/summary`),
    enabled: !!customerIdStr,
  });

  const { data: availableCredits = [], isLoading: creditsLoading } = useQuery<CreditMemo[]>({
    queryKey: ['/api/credit-memos/customer', customerIdStr, 'unapplied'],
    queryFn: () => apiRequest(`/api/credit-memos/customer/${customerIdStr}/unapplied`),
    enabled: !!customerIdStr && isExpanded,
  });

  const applyCreditMutation = useMutation({
    mutationFn: async ({ memoId, amount }: { memoId: number; amount: number }) => {
      return apiRequest(`/api/credit-memos/${memoId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          applications: [{ orderId, amount }],
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Credit Applied',
        description: `Successfully applied $${parseFloat(applyAmount).toFixed(2)} to order ${orderId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-memos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      setShowApplyDialog(false);
      setSelectedMemo(null);
      setApplyAmount('');
      onCreditApplied?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to apply credit',
        variant: 'destructive',
      });
    },
  });

  const handleApplyClick = (memo: CreditMemo) => {
    setSelectedMemo(memo);
    const maxApplicable = Math.min(memo.unappliedAmount, orderTotal);
    setApplyAmount(maxApplicable.toFixed(2));
    setShowApplyDialog(true);
  };

  const handleApplyConfirm = () => {
    if (!selectedMemo || !orderId) return;
    const amount = parseFloat(applyAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }
    if (amount > selectedMemo.unappliedAmount) {
      toast({
        title: 'Amount Too High',
        description: `Maximum available is $${selectedMemo.unappliedAmount.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }
    applyCreditMutation.mutate({ memoId: selectedMemo.id, amount });
  };

  const getSourceTypeLabel = (sourceType: string) => {
    switch (sourceType) {
      case 'overpayment':
        return 'Overpayment';
      case 'return':
        return 'Return Credit';
      default:
        return 'Manual Credit';
    }
  };

  if (!customerIdStr || summaryLoading) {
    return null;
  }

  const totalCredits = creditSummary?.totalAvailableCredits || 0;

  if (totalCredits <= 0) {
    return null;
  }

  return (
    <>
      <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
        <CardContent className="p-3">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="credit-indicator-toggle"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-700 dark:text-green-400">
                Available Credits:
              </span>
              <Badge variant="secondary" className="bg-green-600 text-white">
                ${totalCredits.toFixed(2)}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isExpanded && (
            <div className="mt-3 space-y-2">
              {creditsLoading ? (
                <div className="text-sm text-muted-foreground">Loading credits...</div>
              ) : availableCredits.length === 0 ? (
                <div className="text-sm text-muted-foreground">No available credits</div>
              ) : (
                availableCredits.map((memo) => (
                  <div
                    key={memo.id}
                    className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{memo.memoNumber}</span>
                        <Badge variant="outline" className="text-xs">
                          {getSourceTypeLabel(memo.sourceType)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {memo.reason} | ${memo.unappliedAmount.toFixed(2)} available
                      </div>
                    </div>
                    {orderId && orderId !== 'Loading...' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyClick(memo);
                        }}
                        data-testid={`button-apply-credit-${memo.id}`}
                      >
                        <DollarSign className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Credit to Order</DialogTitle>
            <DialogDescription>
              Apply credit from {selectedMemo?.memoNumber} to order {orderId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Credit Memo</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="font-medium">{selectedMemo?.memoNumber}</div>
                <div className="text-sm text-muted-foreground">
                  Available: ${selectedMemo?.unappliedAmount.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">{selectedMemo?.reason}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply-amount">Amount to Apply</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="apply-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedMemo?.unappliedAmount}
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(e.target.value)}
                  className="pl-6"
                  data-testid="input-apply-amount"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Order total: ${orderTotal.toFixed(2)} | Max available: $
                {selectedMemo?.unappliedAmount.toFixed(2)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyConfirm}
              disabled={applyCreditMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-apply-credit"
            >
              {applyCreditMutation.isPending ? (
                'Applying...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Apply Credit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

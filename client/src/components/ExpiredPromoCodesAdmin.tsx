import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AlertTriangle, Calendar, History, RefreshCw, ChevronDown } from 'lucide-react';
import type { ShortTermSale, PromoCodeOverrideAudit } from '@shared/schema';

interface AuditHistoryModalProps {
  promoCodeId: number;
  promoCodeName: string;
  isOpen: boolean;
  onClose: () => void;
}

function AuditHistoryModal({ promoCodeId, promoCodeName, isOpen, onClose }: AuditHistoryModalProps) {
  const { data: auditHistory = [], isLoading } = useQuery<PromoCodeOverrideAudit[]>({
    queryKey: ['/api/discounts/admin/promo-codes', promoCodeId, 'audit-history'],
    queryFn: () => apiRequest(`/api/discounts/admin/promo-codes/${promoCodeId}/audit-history`),
    enabled: isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Override Audit History: {promoCodeName}</DialogTitle>
          <DialogDescription>
            Complete history of override changes for this promo code
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading audit history...</div>
        ) : auditHistory.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No override history found</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditHistory.map((entry) => (
                  <TableRow key={entry.id} data-testid={`audit-row-${entry.id}`}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>{entry.userId}</TableCell>
                    <TableCell>
                      <Badge variant={entry.newStatus ? 'default' : 'secondary'}>
                        {entry.newStatus ? 'Activated' : 'Deactivated'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={entry.reason}>
                      {entry.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-audit">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpiredPromoCodesAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [selectedPromoCode, setSelectedPromoCode] = useState<ShortTermSale | null>(null);
  const [actionType, setActionType] = useState<'activate' | 'deactivate'>('activate');
  const [reason, setReason] = useState('');
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditPromoCode, setAuditPromoCode] = useState<{ id: number; name: string } | null>(null);

  const { data: expiredPromoCodes = [], isLoading, error } = useQuery<ShortTermSale[]>({
    queryKey: ['/api/discounts/short-term-sales/expired'],
    queryFn: () => apiRequest('/api/discounts/short-term-sales/expired'),
  });

  const reactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest(`/api/discounts/admin/promo-codes/${id}/reactivate`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/discounts/short-term-sales'] });
      queryClient.invalidateQueries({ queryKey: ['/api/discounts/short-term-sales/expired'] });
      setReasonDialogOpen(false);
      setReason('');
      setSelectedPromoCode(null);
      toast({
        title: 'Override Activated',
        description: 'The expired promo code can now be used for administrative corrections.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to activate override',
        variant: 'destructive',
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest(`/api/discounts/admin/promo-codes/${id}/deactivate`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/discounts/short-term-sales'] });
      queryClient.invalidateQueries({ queryKey: ['/api/discounts/short-term-sales/expired'] });
      setReasonDialogOpen(false);
      setReason('');
      setSelectedPromoCode(null);
      toast({
        title: 'Override Deactivated',
        description: 'The promo code override has been disabled.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate override',
        variant: 'destructive',
      });
    },
  });

  const handleOverrideToggle = (promoCode: ShortTermSale, newValue: boolean) => {
    setSelectedPromoCode(promoCode);
    setActionType(newValue ? 'activate' : 'deactivate');
    setReason('');
    setReasonDialogOpen(true);
  };

  const handleSubmitReason = () => {
    if (!selectedPromoCode || !reason.trim()) return;

    if (actionType === 'activate') {
      reactivateMutation.mutate({ id: selectedPromoCode.id, reason: reason.trim() });
    } else {
      deactivateMutation.mutate({ id: selectedPromoCode.id, reason: reason.trim() });
    }
  };

  const handleViewAuditHistory = (promoCode: ShortTermSale) => {
    setAuditPromoCode({ id: promoCode.id, name: promoCode.name });
    setAuditModalOpen(true);
  };

  const isPending = reactivateMutation.isPending || deactivateMutation.isPending;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          Failed to load expired promo codes. Please try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Expired Promo Code Overrides
          </CardTitle>
          <CardDescription className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Administrative override for expired promotional codes. Original expiration dates remain unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading expired promo codes...
            </div>
          ) : expiredPromoCodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expired promotional codes found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code Name</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Original Expiration</TableHead>
                  <TableHead>Active Status</TableHead>
                  <TableHead>Override Status</TableHead>
                  <TableHead className="text-center">Enable Override</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiredPromoCodes.map((promo) => (
                  <TableRow key={promo.id} data-testid={`promo-row-${promo.id}`}>
                    <TableCell className="font-medium">{promo.name}</TableCell>
                    <TableCell>{promo.percent}%</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(promo.endDate), 'yyyy-MM-dd')}
                      <span className="ml-2 text-xs text-red-500">(Expired)</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={promo.isActive === 1 ? 'default' : 'secondary'}>
                        {promo.isActive === 1 ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={promo.overrideActive ? 'default' : 'outline'}
                        className={promo.overrideActive ? 'bg-green-600' : ''}
                      >
                        {promo.overrideActive ? 'Override Active' : 'No Override'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={promo.overrideActive}
                        onCheckedChange={(checked) => handleOverrideToggle(promo, checked)}
                        disabled={isPending}
                        data-testid={`switch-override-${promo.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewAuditHistory(promo)}
                        data-testid={`button-history-${promo.id}`}
                      >
                        <History className="h-4 w-4 mr-1" />
                        History
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'activate' ? 'Activate Override' : 'Deactivate Override'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'activate' 
                ? 'This will allow the expired promo code to be used despite its expiration date. The original expiration date will NOT be changed.'
                : 'This will disable the override and the promo code will no longer be usable.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedPromoCode && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm">
                  <strong>Promo Code:</strong> {selectedPromoCode.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  <strong>Expired:</strong> {format(new Date(selectedPromoCode.endDate), 'yyyy-MM-dd')}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for {actionType === 'activate' ? 'Override' : 'Deactivation'} <span className="text-red-500">*</span></Label>
              <Textarea
                id="reason"
                placeholder="Enter the reason for this administrative action..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                data-testid="input-reason"
              />
              <p className="text-xs text-muted-foreground">
                This reason will be recorded in the audit log.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setReasonDialogOpen(false)}
              disabled={isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitReason}
              disabled={!reason.trim() || isPending}
              data-testid="button-submit-reason"
            >
              {isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {actionType === 'activate' ? 'Activate Override' : 'Deactivate Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {auditPromoCode && (
        <AuditHistoryModal
          promoCodeId={auditPromoCode.id}
          promoCodeName={auditPromoCode.name}
          isOpen={auditModalOpen}
          onClose={() => {
            setAuditModalOpen(false);
            setAuditPromoCode(null);
          }}
        />
      )}
    </>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { performMutation } from '@/offline/performMutation';

interface UseOrderActionsOptions {
  onSuccess?: () => void;
}

export function useOrderActions(options: UseOrderActionsOptions = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateOrderQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
    queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
  };

  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string; nextDepartment?: string }) => {
      return performMutation('MOVE_ORDER', { orderId, nextDepartment }, {
        onOfflineOptimistic: () => {
          toast({
            title: 'Queued Offline',
            description: `Order ${orderId} progression will sync when back online`,
          });
        },
      });
    },
    onSuccess: async (result, variables) => {
      if (result?.queued) return;
      toast({
        title: 'Success',
        description: `Order ${variables.orderId} progressed successfully`,
      });
      invalidateOrderQueries();
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to progress order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason, sendToRts }: { orderId: string; reason: string; sendToRts: boolean }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason, sendToRts }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Order Cancelled',
        description: 'The order has been cancelled successfully.',
      });
      invalidateOrderQueries();
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to cancel order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const undoCancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/undo-cancel/${orderId}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Order Restored',
        description: 'The order has been restored to production queue.',
      });
      invalidateOrderQueries();
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to restore order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const resendSignatureEmailMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/followup-orders/${orderId}/resend-email`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent',
        description: 'Review and sign email has been resent to the customer.',
      });
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to send email: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const sendUpdatedOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/followup-orders/${orderId}/send-updated-order`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Updated Order Sent',
        description: 'A new signature request with the updated order has been sent.',
      });
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to send updated order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const emailPdfCopyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/email-pdf-copy`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'PDF Emailed',
        description: 'A PDF copy of the order has been emailed to the customer.',
      });
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to email PDF: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  const setUrgencyMutation = useMutation({
    mutationFn: async ({ orderId, urgency }: { orderId: string; urgency: string }) => {
      return apiRequest(`/api/orders/${orderId}/urgency`, {
        method: 'PUT',
        body: JSON.stringify({ urgency }),
      });
    },
    onSuccess: (_, variables) => {
      toast({
        title: 'Priority Updated',
        description: variables.urgency === 'critical' ? 'Order marked as urgent' : 'Urgent priority removed',
      });
      invalidateOrderQueries();
      options.onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to update urgency: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  return {
    progressOrderMutation,
    cancelOrderMutation,
    undoCancelMutation,
    resendSignatureEmailMutation,
    sendUpdatedOrderMutation,
    emailPdfCopyMutation,
    setUrgencyMutation,
    isAnyPending:
      progressOrderMutation.isPending ||
      cancelOrderMutation.isPending ||
      undoCancelMutation.isPending ||
      resendSignatureEmailMutation.isPending ||
      sendUpdatedOrderMutation.isPending ||
      emailPdfCopyMutation.isPending ||
      setUrgencyMutation.isPending,
  };
}

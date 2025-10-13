import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Package2, Loader2 } from 'lucide-react';

interface ManualTrackingEntryProps {
  orderId: string;
  onSuccess?: () => void;
}

const carriers = [
  { value: 'UPS', label: 'UPS' },
  { value: 'USPS', label: 'USPS' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'DHL', label: 'DHL' },
  { value: 'Other', label: 'Other' },
];

const shippingMethods = [
  { value: 'Ground', label: 'Ground' },
  { value: 'Next Day Air', label: 'Next Day Air' },
  { value: 'Second Day Air', label: 'Second Day Air' },
  { value: 'Priority', label: 'Priority' },
  { value: 'Express', label: 'Express' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Other', label: 'Other' },
];

export function ManualTrackingEntry({ orderId, onSuccess }: ManualTrackingEntryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [shippingMethod, setShippingMethod] = useState('Ground');
  const [sendNotification, setSendNotification] = useState(true);
  const [notificationMethod, setNotificationMethod] = useState<'email' | 'sms' | 'both'>('email');

  const markShippedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/shipping/mark-shipped/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim(),
          shippingCarrier: carrier,
          shippingMethod: shippingMethod,
          sendNotification,
          notificationMethod,
        }),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: `Order ${orderId} marked as shipped with tracking number ${trackingNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shipping/ready-for-shipping'] });
      setOpen(false);
      resetForm();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark order as shipped',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setTrackingNumber('');
    setCarrier('UPS');
    setShippingMethod('Ground');
    setSendNotification(true);
    setNotificationMethod('email');
  };

  const handleSubmit = () => {
    if (!trackingNumber.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a tracking number',
        variant: 'destructive',
      });
      return;
    }
    markShippedMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          data-testid={`button-manual-tracking-${orderId}`}
        >
          <Package2 className="h-4 w-4 mr-2" />
          Manual Tracking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Tracking Information</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tracking-number">Tracking Number *</Label>
            <Input
              id="tracking-number"
              placeholder="Enter tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              data-testid="input-tracking-number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="carrier">Carrier *</Label>
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger id="carrier" data-testid="select-carrier">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                {carriers.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shipping-method">Shipping Method *</Label>
            <Select value={shippingMethod} onValueChange={setShippingMethod}>
              <SelectTrigger id="shipping-method" data-testid="select-shipping-method">
                <SelectValue placeholder="Select shipping method" />
              </SelectTrigger>
              <SelectContent>
                {shippingMethods.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-notification"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked as boolean)}
                data-testid="checkbox-send-notification"
              />
              <Label htmlFor="send-notification" className="font-normal cursor-pointer">
                Send customer notification
              </Label>
            </div>

            {sendNotification && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="notification-method">Notification Method</Label>
                <Select 
                  value={notificationMethod} 
                  onValueChange={(value) => setNotificationMethod(value as 'email' | 'sms' | 'both')}
                >
                  <SelectTrigger id="notification-method" data-testid="select-notification-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={markShippedMutation.isPending}
            data-testid="button-submit-tracking"
          >
            {markShippedMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Mark as Shipped
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

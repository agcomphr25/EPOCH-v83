import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Truck, Package, Clock, CheckCircle, Send } from 'lucide-react';

interface TrackingInfo {
  orderId: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippingMethod?: string;
  shippedDate?: string;
  estimatedDelivery?: string;
  customerNotified?: boolean;
  notificationMethod?: string;
  notificationSentAt?: string;
  deliveryConfirmed?: boolean;
  deliveryConfirmedAt?: string;
}

interface ShippingTrackerProps {
  orderId: string;
  onUpdate?: () => void;
}

export function ShippingTracker({ orderId, onUpdate }: ShippingTrackerProps) {
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    trackingNumber: '',
    carrier: 'UPS',
    estimatedDelivery: '',
    sendNotification: true
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTrackingInfo();
  }, [orderId]);

  const loadTrackingInfo = async () => {
    try {
      const response = await fetch(`/api/shipping/tracking/${orderId}`);
      if (response.ok) {
        const data = await response.json();
        setTrackingInfo(data);
        setFormData({
          trackingNumber: data.trackingNumber || '',
          carrier: data.shippingCarrier || 'UPS',
          estimatedDelivery: data.estimatedDelivery ? data.estimatedDelivery.split('T')[0] : '',
          sendNotification: false
        });
      }
    } catch (error) {
      console.error('Failed to load tracking info:', error);
    }
  };

  const updateTracking = async () => {
    if (!formData.trackingNumber.trim()) {
      toast({
        title: "Error",
        description: "Tracking number is required",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/shipping/update-tracking/${orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          trackingNumber: formData.trackingNumber,
          carrier: formData.carrier,
          estimatedDelivery: formData.estimatedDelivery || null,
          sendNotification: formData.sendNotification
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Success",
          description: "Tracking information updated successfully"
        });
        
        setIsEditing(false);
        await loadTrackingInfo();
        onUpdate?.();
      } else {
        throw new Error('Failed to update tracking');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update tracking information",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusIcon = () => {
    if (trackingInfo?.deliveryConfirmed) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    } else if (trackingInfo?.trackingNumber) {
      return <Truck className="h-5 w-5 text-blue-600" />;
    } else {
      return <Package className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    if (trackingInfo?.deliveryConfirmed) {
      return 'Delivered';
    } else if (trackingInfo?.trackingNumber) {
      return 'Shipped';
    } else {
      return 'Pending';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Shipping & Tracking - {getStatusText()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEditing && trackingInfo ? (
          <div className="space-y-3">
            {trackingInfo.trackingNumber && (
              <div className="flex items-center justify-between">
                <span className="font-medium">Tracking Number:</span>
                <Badge variant="outline" className="font-mono">
                  {trackingInfo.trackingNumber}
                </Badge>
              </div>
            )}
            
            {trackingInfo.shippingCarrier && (
              <div className="flex items-center justify-between">
                <span className="font-medium">Carrier:</span>
                <span>{trackingInfo.shippingCarrier}</span>
              </div>
            )}
            
            {trackingInfo.shippedDate && (
              <div className="flex items-center justify-between">
                <span className="font-medium">Shipped Date:</span>
                <span>{formatDate(trackingInfo.shippedDate)}</span>
              </div>
            )}
            
            {trackingInfo.estimatedDelivery && (
              <div className="flex items-center justify-between">
                <span className="font-medium">Est. Delivery:</span>
                <span>{formatDate(trackingInfo.estimatedDelivery)}</span>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <span className="font-medium">Customer Notified:</span>
              <div className="flex items-center gap-2">
                {trackingInfo.customerNotified ? (
                  <Badge variant="default" className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    {trackingInfo.notificationMethod || 'Yes'}
                  </Badge>
                ) : (
                  <Badge variant="secondary">No</Badge>
                )}
              </div>
            </div>
            
            <Button 
              onClick={() => setIsEditing(true)}
              variant="outline" 
              className="w-full"
            >
              Update Tracking Info
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">Tracking Number</Label>
              <Input
                id="trackingNumber"
                value={formData.trackingNumber}
                onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                placeholder="Enter tracking number"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier</Label>
              <Select value={formData.carrier} onValueChange={(value) => setFormData({ ...formData, carrier: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPS">UPS</SelectItem>
                  <SelectItem value="FedEx">FedEx</SelectItem>
                  <SelectItem value="USPS">USPS</SelectItem>
                  <SelectItem value="DHL">DHL</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="estimatedDelivery">Estimated Delivery Date (Optional)</Label>
              <Input
                id="estimatedDelivery"
                type="date"
                value={formData.estimatedDelivery}
                onChange={(e) => setFormData({ ...formData, estimatedDelivery: e.target.value })}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendNotification"
                checked={formData.sendNotification}
                onCheckedChange={(checked) => setFormData({ ...formData, sendNotification: checked as boolean })}
              />
              <Label htmlFor="sendNotification">Send customer notification</Label>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={updateTracking} 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 animate-spin" />
                    Updating...
                  </div>
                ) : (
                  'Update Tracking'
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsEditing(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { sendOrderConfirmation, sendShippingNotification, sendQualityControlAlert, type CommunicationMethod } from '@/utils/communicationUtils';
import { useToast } from '@/hooks/use-toast';

interface CustomerPreferences {
  email: string;
  phone: string;
  preferredMethod: CommunicationMethod;
}

interface CommunicationPanelProps {
  orderId: string;
  customerPreferences: CustomerPreferences;
  className?: string;
}

export default function CommunicationPanel({ orderId, customerPreferences, className }: CommunicationPanelProps) {
  const [selectedMethod, setSelectedMethod] = useState<CommunicationMethod>(customerPreferences.preferredMethod);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSendCommunication = async (type: 'confirmation' | 'shipping' | 'quality') => {
    setIsLoading(true);
    try {
      switch (type) {
        case 'confirmation':
          await sendOrderConfirmation(orderId, selectedMethod);
          break;
        case 'shipping':
          await sendShippingNotification(orderId, selectedMethod);
          break;
        case 'quality':
          await sendQualityControlAlert(orderId, selectedMethod, 'Quality control alert for your order');
          break;
      }
      
      toast({
        title: 'Message sent successfully',
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} notification sent via ${selectedMethod.toUpperCase()}`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Communication failed',
        description: 'Failed to send notification. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMethodIcon = (method: CommunicationMethod) => {
    return method === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Customer Communications
        </CardTitle>
        <CardDescription>
          Send notifications and updates to customer for Order #{orderId}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Method Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Communication Method</label>
          <Select value={selectedMethod} onValueChange={(value: CommunicationMethod) => setSelectedMethod(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email ({customerPreferences.email})
                </div>
              </SelectItem>
              <SelectItem value="sms">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS ({customerPreferences.phone})
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Customer Preferences */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Preferred method:</span>
          <Badge variant="secondary" className="flex items-center gap-1">
            {getMethodIcon(customerPreferences.preferredMethod)}
            {customerPreferences.preferredMethod.toUpperCase()}
          </Badge>
        </div>

        {/* Communication Actions */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              onClick={() => handleSendCommunication('confirmation')}
              disabled={isLoading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              Send Order Confirmation
            </Button>
            
            <Button
              onClick={() => handleSendCommunication('shipping')}
              disabled={isLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
              Send Shipping Notice
            </Button>
          </div>
          
          <Button
            onClick={() => handleSendCommunication('quality')}
            disabled={isLoading}
            variant="outline"
            className="w-full flex items-center gap-2 border-yellow-600 text-yellow-600 hover:bg-yellow-50"
          >
            <AlertTriangle className="h-4 w-4" />
            Send Quality Control Alert
          </Button>
        </div>

        {/* Status */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Sending notification...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
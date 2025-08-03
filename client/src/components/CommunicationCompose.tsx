
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageSquare, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface CommunicationComposeProps {
  isOpen: boolean;
  onClose: () => void;
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  orderId?: string;
}

export default function CommunicationCompose({ 
  isOpen, 
  onClose, 
  customer, 
  orderId 
}: CommunicationComposeProps) {
  const [activeTab, setActiveTab] = useState('email');
  const [emailData, setEmailData] = useState({
    to: customer.email || '',
    subject: orderId ? `Regarding Order ${orderId}` : 'Order Update',
    message: ''
  });
  const [smsData, setSmsData] = useState({
    to: customer.phone || '',
    message: ''
  });
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSendEmail = async () => {
    if (!emailData.to || !emailData.subject || !emailData.message) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all email fields',
        variant: 'destructive'
      });
      return;
    }

    setSending(true);
    try {
      await apiRequest('/api/communications/email', {
        method: 'POST',
        body: {
          to: emailData.to,
          subject: emailData.subject,
          message: emailData.message,
          customerId: customer.id,
          orderId: orderId || null
        }
      });

      toast({
        title: 'Email Sent',
        description: `Email sent successfully to ${customer.name}`
      });

      // Reset form
      setEmailData({
        to: customer.email || '',
        subject: orderId ? `Regarding Order ${orderId}` : 'Order Update',
        message: ''
      });
      onClose();
    } catch (error: any) {
      toast({
        title: 'Email Failed',
        description: error.message || 'Failed to send email',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsData.to || !smsData.message) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in phone number and message',
        variant: 'destructive'
      });
      return;
    }

    setSending(true);
    try {
      await apiRequest('/api/communications/sms', {
        method: 'POST',
        body: {
          to: smsData.to,
          message: smsData.message,
          customerId: customer.id,
          orderId: orderId || null
        }
      });

      toast({
        title: 'SMS Sent',
        description: `SMS sent successfully to ${customer.name}`
      });

      // Reset form
      setSmsData({
        to: customer.phone || '',
        message: ''
      });
      onClose();
    } catch (error: any) {
      toast({
        title: 'SMS Failed',
        description: error.message || 'Failed to send SMS',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Compose Message - {customer.name}
            {orderId && <span className="text-sm text-gray-500">({orderId})</span>}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Send Email via SendGrid</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="email-to">To</Label>
                  <Input
                    id="email-to"
                    type="email"
                    value={emailData.to}
                    onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                    placeholder="customer@example.com"
                  />
                </div>
                
                <div>
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    value={emailData.subject}
                    onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Email subject"
                  />
                </div>
                
                <div>
                  <Label htmlFor="email-message">Message</Label>
                  <Textarea
                    id="email-message"
                    rows={6}
                    value={emailData.message}
                    onChange={(e) => setEmailData(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Enter your email message here..."
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={onClose}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSendEmail} disabled={sending}>
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? 'Sending...' : 'Send Email'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Send SMS via Twilio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="sms-to">Phone Number</Label>
                  <Input
                    id="sms-to"
                    type="tel"
                    value={smsData.to}
                    onChange={(e) => setSmsData(prev => ({ ...prev, to: e.target.value }))}
                    placeholder="+1234567890"
                  />
                </div>
                
                <div>
                  <Label htmlFor="sms-message">Message</Label>
                  <Textarea
                    id="sms-message"
                    rows={4}
                    maxLength={160}
                    value={smsData.message}
                    onChange={(e) => setSmsData(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Enter your SMS message here... (160 characters max)"
                  />
                  <div className="text-sm text-gray-500 mt-1">
                    {smsData.message.length}/160 characters
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={onClose}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSendSMS} disabled={sending}>
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? 'Sending...' : 'Send SMS'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

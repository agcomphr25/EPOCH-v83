import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Phone, MessageSquare, Clock, User, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Message {
  id: number;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  type: 'email' | 'sms';
  direction: 'inbound' | 'outbound';
  subject?: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sender?: string;
  recipient?: string;
}

export default function CommunicationInbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'email' | 'sms'>('all');
  const [replyMessage, setReplyMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/communications/inbox');
      if (response.ok) {
        const data = await response.json();
        setMessages(data.map((msg: any) => ({
          id: msg.id,
          customerId: msg.customerId,
          customerName: msg.customerName || 'Unknown Customer',
          customerEmail: msg.customerEmail,
          customerPhone: msg.customerPhone,
          type: msg.method,
          direction: msg.direction,
          subject: msg.subject,
          message: msg.message,
          timestamp: msg.receivedAt || msg.sentAt || msg.createdAt,
          isRead: msg.isRead,
          priority: msg.priority || 'normal',
          sender: msg.sender,
          recipient: msg.recipient
        })));
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId: number) => {
    try {
      const response = await fetch(`/api/communications/inbox/${messageId}/read`, {
        method: 'PATCH'
      });
      if (response.ok) {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId ? { ...msg, isRead: true } : msg
          )
        );
      }
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  const sendReply = async () => {
    if (!replyingTo || !replyMessage.trim()) return;

    try {
      setSending(true);
      const endpoint = replyingTo.type === 'email' ? '/api/communications/email' : '/api/communications/sms';
      const payload = replyingTo.type === 'email' ? {
        to: replyingTo.customerEmail,
        subject: `Re: ${replyingTo.subject || 'Your inquiry'}`,
        message: replyMessage,
        customerId: replyingTo.customerId
      } : {
        to: replyingTo.customerPhone,
        message: replyMessage,
        customerId: replyingTo.customerId
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setReplyMessage('');
        setReplyingTo(null);
        // Refresh messages to show the reply
        fetchMessages();
      } else {
        console.error('Failed to send reply');
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending(false);
    }
  };

  const filteredMessages = messages.filter(message => {
    switch (filter) {
      case 'unread':
        return !message.isRead;
      case 'email':
        return message.type === 'email';
      case 'sms':
        return message.type === 'sms';
      default:
        return true;
    }
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={filter} onValueChange={(value) => setFilter(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Messages</TabsTrigger>
          <TabsTrigger value="unread">Unread ({filteredMessages.filter(m => !m.isRead).length})</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="space-y-4">
          {filteredMessages.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No messages found.</p>
              </CardContent>
            </Card>
          ) : (
            filteredMessages.map((message) => (
              <Card key={message.id} className={`transition-colors ${!message.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {message.type === 'email' ? (
                          <Mail className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Phone className="h-4 w-4 text-green-600" />
                        )}
                        <span className="font-medium">{message.customerName}</span>
                      </div>
                      <Badge className={getPriorityColor(message.priority)}>
                        {message.priority}
                      </Badge>
                      {message.direction === 'inbound' && (
                        <Badge variant="outline">Incoming</Badge>
                      )}
                      {message.direction === 'outbound' && (
                        <Badge variant="secondary">Sent</Badge>
                      )}
                      {!message.isRead && message.direction === 'inbound' && (
                        <Badge variant="destructive">New</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {new Date(message.timestamp).toLocaleString()}
                    </div>
                  </div>
                  {message.subject && (
                    <CardTitle className="text-lg">{message.subject}</CardTitle>
                  )}
                  <CardDescription className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {message.direction === 'inbound' 
                      ? `From: ${message.type === 'email' ? message.customerEmail : message.customerPhone}`
                      : `To: ${message.type === 'email' ? message.customerEmail : message.customerPhone}`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm leading-relaxed">{message.message}</p>
                    <div className="flex gap-2">
                      {message.direction === 'inbound' && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setReplyingTo(message)}
                            >
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Reply
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Reply to {message.customerName}</DialogTitle>
                              <DialogDescription>
                                Send a {message.type} reply to {message.type === 'email' ? message.customerEmail : message.customerPhone}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Textarea
                                placeholder={`Type your ${message.type} reply here...`}
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                rows={4}
                              />
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  onClick={() => {
                                    setReplyingTo(null);
                                    setReplyMessage('');
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={sendReply}
                                  disabled={sending || !replyMessage.trim()}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  {sending ? 'Sending...' : 'Send Reply'}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      {!message.isRead && message.direction === 'inbound' && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => markAsRead(message.id)}
                        >
                          Mark as Read
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
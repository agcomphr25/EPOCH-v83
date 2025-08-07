import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Mail, 
  MessageSquare, 
  Phone, 
  User, 
  Clock, 
  Filter,
  Send,
  Eye,
  EyeOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: number;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  type: string;
  method: 'email' | 'sms';
  direction: 'inbound' | 'outbound';
  subject?: string;
  message: string;
  status: string;
  isRead: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sender?: string;
  recipient?: string;
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
  assignedTo?: string;
}

export default function CommunicationInbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'email' | 'sms'>('all');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/api/communications/inbox');
      setMessages(data);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId: number) => {
    try {
      await apiRequest(`/api/communications/inbox/${messageId}/read`, {
        method: 'PATCH'
      });
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, isRead: true } : msg
      ));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to mark message as read',
        variant: 'destructive'
      });
    }
  };

  const sendReply = async () => {
    if (!selectedMessage || !replyMessage.trim()) return;

    setSending(true);
    try {
      const endpoint = selectedMessage.method === 'email' 
        ? '/api/communications/email' 
        : '/api/communications/sms';
      
      await apiRequest(endpoint, {
        method: 'POST',
        body: {
          to: selectedMessage.method === 'email' ? selectedMessage.customerEmail : selectedMessage.customerPhone,
          subject: selectedMessage.method === 'email' ? `Re: ${selectedMessage.subject}` : undefined,
          message: replyMessage,
          customerId: selectedMessage.customerId
        }
      });

      toast({
        title: 'Reply Sent',
        description: `${selectedMessage.method.toUpperCase()} reply sent successfully`
      });

      setReplyMessage('');
      setSelectedMessage(null);
      fetchMessages(); // Refresh to show the new outbound message
    } catch (error: any) {
      toast({
        title: 'Error',
        description: `Failed to send ${selectedMessage.method.toUpperCase()} reply`,
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  const filteredMessages = messages.filter(msg => {
    switch (filter) {
      case 'unread':
        return !msg.isRead;
      case 'email':
        return msg.method === 'email';
      case 'sms':
        return msg.method === 'sms';
      default:
        return true;
    }
  });

  const getMethodIcon = (method: string) => {
    return method === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-gray-500';
      default: return 'bg-blue-500';
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Customer Communications Inbox</h2>
        <Button onClick={fetchMessages} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(value) => setFilter(value as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
          <TabsTrigger value="unread">
            Unread ({messages.filter(m => !m.isRead).length})
          </TabsTrigger>
          <TabsTrigger value="email">
            Email ({messages.filter(m => m.method === 'email').length})
          </TabsTrigger>
          <TabsTrigger value="sms">
            SMS ({messages.filter(m => m.method === 'sms').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {/* Messages List */}
          {filteredMessages.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages found</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredMessages.map((message) => (
              <Card 
                key={message.id} 
                className={`mb-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                  !message.isRead ? 'border-l-4 border-l-blue-500 bg-blue-50' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between space-x-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        {getMethodIcon(message.method)}
                        <span className="font-medium text-sm">{message.customerName}</span>
                        <Badge 
                          variant="secondary" 
                          className={`text-white ${getPriorityColor(message.priority)}`}
                        >
                          {message.priority}
                        </Badge>
                        {message.direction === 'inbound' && (
                          <Badge variant="outline">
                            Received
                          </Badge>
                        )}
                        {message.direction === 'outbound' && (
                          <Badge variant="outline">
                            Sent
                          </Badge>
                        )}
                        {!message.isRead && (
                          <Badge variant="default">
                            Unread
                          </Badge>
                        )}
                      </div>
                      
                      {message.subject && (
                        <h4 className="text-sm font-medium mb-1">{message.subject}</h4>
                      )}
                      
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                        {message.message}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                        </span>
                        
                        {message.method === 'email' && message.customerEmail && (
                          <span className="flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {message.customerEmail}
                          </span>
                        )}
                        
                        {message.method === 'sms' && message.customerPhone && (
                          <span className="flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            {message.customerPhone}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-2">
                      {message.direction === 'inbound' && (
                        <Button 
                          size="sm" 
                          onClick={() => setSelectedMessage(message)}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Reply
                        </Button>
                      )}
                      
                      {/* Reply Dialog */}
                      {selectedMessage?.id === message.id && (
                        <Dialog open={true} onOpenChange={() => setSelectedMessage(null)}>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>
                                Reply to {selectedMessage.customerName} via {selectedMessage.method.toUpperCase()}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm font-medium mb-2">Original Message:</p>
                                <p className="text-sm text-gray-700">{selectedMessage.message}</p>
                              </div>
                              
                              <Textarea
                                placeholder={`Type your ${selectedMessage.method} reply...`}
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                className="min-h-[120px]"
                              />
                              
                              <div className="flex justify-end space-x-2">
                                <Button 
                                  variant="outline" 
                                  onClick={() => setSelectedMessage(null)}
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
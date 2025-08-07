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
      </Tabs>

      {/* Messages List */}
      <div className="space-y-3">
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
              className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                !message.isRead ? 'border-l-4 border-l-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => {
                setSelectedMessage(message);
                if (!message.isRead) {
                  markAsRead(message.id);
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="flex-shrink-0">
                      {getMethodIcon(message.method)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm">{message.customerName}</span>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getPriorityColor(message.priority)} text-white`}
                        >
                          {message.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {message.direction}
                        </Badge>
                        {!message.isRead && (
                          <Badge variant="default" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-1">
                        {message.method === 'email' ? message.customerEmail : message.customerPhone}
                      </div>
                      
                      {message.subject && (
                        <div className="font-medium text-sm mb-1">{message.subject}</div>
                      )}
                      
                      <div className="text-sm text-gray-700 line-clamp-2">
                        {message.message}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 flex-shrink-0 ml-4">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedMessage && getMethodIcon(selectedMessage.method)}
              <span>Message from {selectedMessage?.customerName}</span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Customer:</strong> {selectedMessage.customerName}
                </div>
                <div>
                  <strong>Method:</strong> {selectedMessage.method.toUpperCase()}
                </div>
                <div>
                  <strong>Contact:</strong> {selectedMessage.method === 'email' 
                    ? selectedMessage.customerEmail 
                    : selectedMessage.customerPhone}
                </div>
                <div>
                  <strong>Priority:</strong> {selectedMessage.priority}
                </div>
              </div>
              
              {selectedMessage.subject && (
                <div>
                  <strong>Subject:</strong> {selectedMessage.subject}
                </div>
              )}
              
              <div>
                <strong>Message:</strong>
                <div className="mt-2 p-3 bg-gray-50 rounded border">
                  {selectedMessage.message}
                </div>
              </div>
              
              <div>
                <strong>Reply:</strong>
                <Textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder={`Type your ${selectedMessage.method} reply here...`}
                  rows={4}
                  className="mt-2"
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedMessage(null)}
                >
                  Close
                </Button>
                <Button 
                  onClick={sendReply}
                  disabled={!replyMessage.trim() || sending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? 'Sending...' : `Send ${selectedMessage.method.toUpperCase()}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

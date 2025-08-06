
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Mail, MessageSquare, Phone, Reply, Clock, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface InboxMessage {
  id: string;
  customerId: string;
  customerName: string;
  type: 'email' | 'sms';
  from: string;
  subject?: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  orderId?: string;
}

export default function CommunicationInbox() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const { toast } = useToast();

  const fetchInboxMessages = async () => {
    try {
      const response = await apiRequest('/api/communications/inbox');
      setMessages(response);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load inbox messages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInboxMessages();
    
    // Poll for new messages every 30 seconds
    const interval = setInterval(fetchInboxMessages, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (messageId: string) => {
    try {
      // TODO: Implement mark as read API call
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, isRead: true } : msg
        )
      );
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to mark message as read',
        variant: 'destructive'
      });
    }
  };

  const handleReply = (message: InboxMessage) => {
    // TODO: Open CommunicationCompose with pre-filled recipient
    toast({
      title: 'Reply Feature',
      description: 'Reply functionality will open the compose dialog',
    });
  };

  const getMessageIcon = (type: 'email' | 'sms') => {
    return type === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getMessageColor = (type: 'email' | 'sms') => {
    return type === 'email' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Message List */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Communication Inbox
          </CardTitle>
          <CardDescription>
            Customer responses and inbound messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages in inbox</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMessage?.id === message.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    } ${!message.isRead ? 'border-l-4 border-l-blue-500' : ''}`}
                    onClick={() => {
                      setSelectedMessage(message);
                      if (!message.isRead) {
                        markAsRead(message.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className={getMessageColor(message.type)}>
                            {getMessageIcon(message.type)}
                            {message.type.toUpperCase()}
                          </Badge>
                          {!message.isRead && (
                            <Badge variant="destructive" className="text-xs">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm truncate">
                          {message.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {message.from}
                        </p>
                        {message.subject && (
                          <p className="text-xs font-medium truncate mt-1">
                            {message.subject}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {message.message}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(message.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Message Detail */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            {selectedMessage ? 'Message Details' : 'Select a message'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedMessage ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={getMessageColor(selectedMessage.type)}>
                    {getMessageIcon(selectedMessage.type)}
                    {selectedMessage.type.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-medium">{selectedMessage.customerName}</p>
                    <p className="text-sm text-muted-foreground">{selectedMessage.from}</p>
                  </div>
                </div>
                <Button
                  onClick={() => handleReply(selectedMessage)}
                  className="flex items-center gap-2"
                >
                  <Reply className="h-4 w-4" />
                  Reply
                </Button>
              </div>
              
              <Separator />
              
              {selectedMessage.subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject:</p>
                  <p className="font-medium">{selectedMessage.subject}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Message:</p>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>Received: {new Date(selectedMessage.timestamp).toLocaleString()}</p>
                {selectedMessage.orderId && (
                  <p>Related Order: {selectedMessage.orderId}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-12">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a message to view details</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

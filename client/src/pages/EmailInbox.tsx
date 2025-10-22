import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Mail, Search, RefreshCw, AlertCircle, Inbox, Star, X, Reply, Send } from 'lucide-react';
import { Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    parts?: any[];
    body?: {
      data?: string;
    };
  };
  internalDate?: string;
}

interface GmailListResponse {
  messages?: Array<GmailMessage>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export default function EmailInbox() {
  const { toast } = useToast();
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  const { data: messageList, isLoading: isLoadingList, refetch: refetchList, error: listError } = useQuery<GmailListResponse>({
    queryKey: activeSearchQuery ? ['/api/gmail/search', { q: activeSearchQuery }] : ['/api/gmail/messages'],
  });

  const { data: selectedMessage, isLoading: isLoadingMessage } = useQuery<GmailMessage>({
    queryKey: ['/api/gmail/messages', selectedMessageId],
    enabled: !!selectedMessageId,
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a search query',
        variant: 'destructive',
      });
      return;
    }
    setActiveSearchQuery(searchQuery);
    setSelectedMessageId(null);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery(null);
    setSelectedMessageId(null);
  };

  const handleRefresh = () => {
    refetchList();
    toast({
      title: 'Refreshed',
      description: 'Email list updated',
    });
  };

  const getHeader = (headers: Array<{ name: string; value: string }> | undefined, name: string): string => {
    const header = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };

  const decodeBase64 = (str: string): string => {
    try {
      const replaced = str.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(replaced)));
    } catch (e) {
      return str;
    }
  };

  const getMessageBody = (message: GmailMessage): string => {
    if (!message.payload) return message.snippet || '';

    let body = '';
    
    if (message.payload.parts) {
      const part = message.payload.parts.find((p: any) => p.mimeType === 'text/plain' || p.mimeType === 'text/html');
      if (part?.body?.data) {
        body = decodeBase64(part.body.data);
      }
    } else if (message.payload.body?.data) {
      body = decodeBase64(message.payload.body.data);
    }

    return body || message.snippet || '';
  };

  const formatDate = (internalDate?: string): string => {
    if (!internalDate) return '';
    const date = new Date(parseInt(internalDate));
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const isUnread = (labels?: string[]): boolean => {
    return labels?.includes('UNREAD') || false;
  };

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string; subject: string; body: string; threadId?: string }) => {
      return apiRequest('/api/gmail/send', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent',
        description: 'Your reply has been sent successfully',
      });
      setIsReplying(false);
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: ['/api/gmail/messages'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send email',
        variant: 'destructive',
      });
    },
  });

  const handleReply = () => {
    if (!selectedMessage) return;

    const from = getHeader(selectedMessage.payload?.headers, 'From');
    const subject = getHeader(selectedMessage.payload?.headers, 'Subject');
    
    // Extract email address from "Name <email>" format
    const emailMatch = from.match(/<(.+)>/);
    const toEmail = emailMatch ? emailMatch[1] : from;
    
    // Add "Re: " prefix if not already present
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    if (!replyBody.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      });
      return;
    }

    sendEmailMutation.mutate({
      to: toEmail,
      subject: replySubject,
      body: replyBody,
      threadId: selectedMessage.threadId,
    });
  };

  if (listError) {
    const errorData = listError as any;
    const needsConnection = errorData?.needsConnection || errorData?.message?.includes('not connected');
    const needsReauth = errorData?.needsReauth;
    
    if (needsConnection || needsReauth) {
      return (
        <div className="min-h-screen bg-background dark:bg-gray-950 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Card className="border-yellow-200 dark:border-yellow-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <CardTitle>
                    {needsReauth ? 'Gmail Reconnection Required' : 'Gmail Not Connected'}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  {needsReauth 
                    ? 'Your Gmail connection has expired. Please reconnect your Gmail account in Settings.' 
                    : 'Please connect your Gmail account in Settings to view your emails.'}
                </p>
                <Link href="/settings">
                  <Button data-testid="button-go-to-settings">
                    <Mail className="mr-2 h-4 w-4" />
                    {needsReauth ? 'Reconnect Gmail' : 'Go to Settings'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground dark:text-white mb-2 flex items-center gap-2">
              <Mail className="h-8 w-8" />
              Email Inbox
            </h1>
            <p className="text-muted-foreground dark:text-gray-400">
              View and manage your Gmail messages
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mb-6">
          <div className="flex gap-2">
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              data-testid="input-search"
              className="max-w-md"
            />
            <Button onClick={handleSearch} data-testid="button-search">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
            {activeSearchQuery && (
              <Button onClick={handleClearSearch} variant="outline" data-testid="button-clear-search">
                <X className="mr-2 h-4 w-4" />
                Clear Search
              </Button>
            )}
          </div>
          {activeSearchQuery && (
            <p className="text-sm text-muted-foreground mt-2">
              Searching for: <strong>{activeSearchQuery}</strong>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Messages ({messageList?.resultSizeEstimate || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingList ? (
                <div className="space-y-2 p-4">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="divide-y dark:divide-gray-800 max-h-[600px] overflow-y-auto">
                  {messageList?.messages?.map((msg) => {
                    const from = getHeader(msg.payload?.headers, 'From');
                    const subject = getHeader(msg.payload?.headers, 'Subject');
                    const date = getHeader(msg.payload?.headers, 'Date');
                    const unread = isUnread(msg.labelIds);
                    
                    return (
                      <div
                        key={msg.id}
                        onClick={() => setSelectedMessageId(msg.id)}
                        className={`p-4 cursor-pointer hover:bg-accent dark:hover:bg-gray-800 transition-colors ${
                          selectedMessageId === msg.id ? 'bg-accent dark:bg-gray-800' : ''
                        } ${unread ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                        data-testid={`message-item-${msg.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {unread && <div className="h-2 w-2 bg-blue-500 rounded-full" />}
                              <p className={`text-sm ${unread ? 'font-semibold' : 'font-medium'} text-foreground dark:text-white truncate`}>
                                {from || 'Unknown Sender'}
                              </p>
                            </div>
                            <p className={`text-sm ${unread ? 'font-medium' : ''} text-foreground dark:text-gray-300 truncate mb-1`}>
                              {subject || '(No Subject)'}
                            </p>
                            <p className="text-xs text-muted-foreground dark:text-gray-500 truncate">
                              {msg.snippet}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground dark:text-gray-500 whitespace-nowrap">
                            {formatDate(msg.internalDate)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!messageList?.messages?.length && (
                    <div className="p-8 text-center text-muted-foreground">
                      <Inbox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No messages found</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Message Details</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMessageId ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a message to view details</p>
                </div>
              ) : isLoadingMessage ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : selectedMessage ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-semibold text-foreground dark:text-white">
                        {getHeader(selectedMessage.payload?.headers, 'Subject') || '(No Subject)'}
                      </h3>
                      <div className="flex items-center gap-2">
                        {isUnread(selectedMessage.labelIds) && (
                          <Badge variant="default" data-testid="badge-unread">Unread</Badge>
                        )}
                        <Button
                          onClick={() => setIsReplying(!isReplying)}
                          variant="outline"
                          size="sm"
                          data-testid="button-reply"
                        >
                          <Reply className="mr-2 h-4 w-4" />
                          Reply
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground dark:text-gray-400">
                      <p data-testid="text-from">
                        <strong>From:</strong> {getHeader(selectedMessage.payload?.headers, 'From')}
                      </p>
                      <p data-testid="text-to">
                        <strong>To:</strong> {getHeader(selectedMessage.payload?.headers, 'To')}
                      </p>
                      <p data-testid="text-date">
                        <strong>Date:</strong> {getHeader(selectedMessage.payload?.headers, 'Date')}
                      </p>
                    </div>
                  </div>
                  <hr className="dark:border-gray-800" />
                  <div 
                    className="prose dark:prose-invert max-w-none"
                    data-testid="text-body"
                    dangerouslySetInnerHTML={{ __html: getMessageBody(selectedMessage).replace(/\n/g, '<br>') }}
                  />
                  
                  {isReplying && (
                    <div className="mt-6 space-y-4 border-t dark:border-gray-800 pt-4">
                      <h4 className="font-semibold text-foreground dark:text-white">Reply</h4>
                      <Textarea
                        placeholder="Type your reply..."
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={6}
                        data-testid="textarea-reply"
                        className="w-full"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleReply}
                          disabled={sendEmailMutation.isPending}
                          data-testid="button-send-reply"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {sendEmailMutation.isPending ? 'Sending...' : 'Send Reply'}
                        </Button>
                        <Button
                          onClick={() => {
                            setIsReplying(false);
                            setReplyBody('');
                          }}
                          variant="outline"
                          disabled={sendEmailMutation.isPending}
                          data-testid="button-cancel-reply"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

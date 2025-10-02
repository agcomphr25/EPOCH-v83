import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Send, 
  AlertTriangle, 
  CheckCircle, 
  Users, 
  User, 
  Paperclip,
  Bell,
  Mail,
  MailOpen,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  Department,
  InternalMessage,
  MessageRecipient,
  MessageAttachment
} from '@shared/schema';

interface MessageWithDetails extends InternalMessage {
  attachments?: MessageAttachment[];
  recipients?: MessageRecipient[];
}

interface User {
  id: number;
  username: string;
  name: string;
  isActive: boolean;
}

export default function InternalCommunicationBoard() {
  const { toast } = useToast();
  const [recipientType, setRecipientType] = useState<'department' | 'person'>('department');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [attachmentNote, setAttachmentNote] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all');
  
  const currentUserId = 1;

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/departments'],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: messages = [], isLoading } = useQuery<MessageWithDetails[]>({
    queryKey: ['/api/internal-messages'],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: any) => {
      return await apiRequest('/api/internal-messages', {
        method: 'POST',
        body: JSON.stringify(messageData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully.",
      });
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async ({ messageId, userId }: { messageId: number; userId: number }) => {
      return await apiRequest(`/api/internal-messages/${messageId}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ userId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });
    },
  });

  const markAsAccomplishedMutation = useMutation({
    mutationFn: async ({ messageId, userId }: { messageId: number; userId: number }) => {
      return await apiRequest(`/api/internal-messages/${messageId}/accomplished`, {
        method: 'PATCH',
        body: JSON.stringify({ userId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });
      toast({
        title: "Marked as accomplished",
        description: "Message marked as accomplished.",
      });
    },
  });

  const resetForm = () => {
    setRecipientType('department');
    setSelectedDepartment('');
    setSelectedPerson('');
    setSubject('');
    setMessage('');
    setIsUrgent(false);
    setAttachmentNote('');
    setShowCompose(false);
  };

  const handleSendMessage = () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide both subject and message.",
        variant: "destructive",
      });
      return;
    }

    if (recipientType === 'department' && !selectedDepartment) {
      toast({
        title: "Validation Error",
        description: "Please select a department.",
        variant: "destructive",
      });
      return;
    }

    if (recipientType === 'person' && !selectedPerson) {
      toast({
        title: "Validation Error",
        description: "Please select a recipient.",
        variant: "destructive",
      });
      return;
    }

    const senderUser = users.find(u => u.id === currentUserId);
    const senderName = senderUser ? senderUser.name : 'Unknown';
    
    let recipientName = '';
    if (recipientType === 'department') {
      const dept = departments.find(d => d.id === parseInt(selectedDepartment));
      recipientName = dept ? dept.name : '';
    } else {
      const user = users.find(u => u.id === parseInt(selectedPerson));
      recipientName = user ? user.name : '';
    }

    const messageData: any = {
      senderId: currentUserId,
      senderName,
      recipientType,
      recipientName,
      subject,
      message,
      isUrgent,
    };

    if (recipientType === 'department') {
      messageData.recipientDepartmentId = parseInt(selectedDepartment);
    } else {
      messageData.recipientUserId = parseInt(selectedPerson);
    }

    sendMessageMutation.mutate(messageData);
  };

  const handleMarkAsRead = (messageId: number) => {
    markAsReadMutation.mutate({ messageId, userId: currentUserId });
  };

  const handleMarkAsAccomplished = (messageId: number) => {
    markAsAccomplishedMutation.mutate({ messageId, userId: currentUserId });
  };

  const getRecipientInfo = (msg: MessageWithDetails) => {
    if (msg.recipientType === 'department' && msg.recipientDepartmentId) {
      const dept = departments.find(d => d.id === msg.recipientDepartmentId);
      return dept ? dept.name : 'Unknown Department';
    } else if (msg.recipientType === 'person' && msg.recipientUserId) {
      const user = users.find(u => u.id === msg.recipientUserId);
      return user ? user.name : 'Unknown User';
    }
    return 'Unknown';
  };

  const getSenderName = (senderId: number) => {
    const user = users.find(u => u.id === senderId);
    return user ? user.name : 'Unknown';
  };

  const getUserRecipientStatus = (msg: MessageWithDetails) => {
    const recipient = msg.recipients?.find(r => r.userId === currentUserId);
    return recipient;
  };

  const filteredMessages = messages.filter(msg => {
    if (filterType === 'sent') return msg.senderId === currentUserId;
    if (filterType === 'received') {
      return msg.recipients?.some(r => r.userId === currentUserId);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {!showCompose ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-[180px]" data-testid="select-message-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">All Messages</SelectItem>
                <SelectItem value="sent" data-testid="filter-sent">Sent</SelectItem>
                <SelectItem value="received" data-testid="filter-received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setShowCompose(true)} data-testid="button-compose">
            <Send className="mr-2 h-4 w-4" />
            Compose Message
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Compose New Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient Type</Label>
              <Select value={recipientType} onValueChange={(value: any) => setRecipientType(value)}>
                <SelectTrigger data-testid="select-recipient-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="department" data-testid="type-department">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Department
                    </div>
                  </SelectItem>
                  <SelectItem value="person" data-testid="type-person">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Specific Person
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientType === 'department' ? (
              <div className="space-y-2">
                <Label>Select Department</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="Choose a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id.toString()} data-testid={`dept-${dept.id}`}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Select Recipient</Label>
                <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                  <SelectTrigger data-testid="select-person">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.isActive).map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()} data-testid={`user-${user.id}`}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter message subject"
                data-testid="input-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={6}
                data-testid="input-message"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachment">Attachment Note/URL</Label>
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="attachment"
                  value={attachmentNote}
                  onChange={(e) => setAttachmentNote(e.target.value)}
                  placeholder="Enter attachment URL or note"
                  data-testid="input-attachment"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="urgent"
                checked={isUrgent}
                onCheckedChange={(checked) => setIsUrgent(checked as boolean)}
                data-testid="checkbox-urgent"
              />
              <Label htmlFor="urgent" className="flex items-center gap-2 cursor-pointer">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Mark as Urgent
              </Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSendMessage} 
                disabled={sendMessageMutation.isPending}
                data-testid="button-send"
              >
                <Send className="mr-2 h-4 w-4" />
                {sendMessageMutation.isPending ? 'Sending...' : 'Send Message'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">Loading messages...</p>
            </CardContent>
          </Card>
        ) : filteredMessages.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground" data-testid="text-no-messages">
                No messages to display
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredMessages.map((msg) => {
            const recipientStatus = getUserRecipientStatus(msg);
            const isReceived = msg.recipients?.some(r => r.userId === currentUserId);
            const isSent = msg.senderId === currentUserId;

            return (
              <Card key={msg.id} className={msg.isUrgent ? 'border-orange-500 border-2' : ''} data-testid={`card-message-${msg.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg" data-testid={`text-subject-${msg.id}`}>
                          {msg.subject}
                        </CardTitle>
                        {msg.isUrgent && (
                          <Badge variant="destructive" className="flex items-center gap-1" data-testid={`badge-urgent-${msg.id}`}>
                            <AlertTriangle className="h-3 w-3" />
                            Urgent
                          </Badge>
                        )}
                        {isSent && (
                          <Badge variant="secondary" data-testid={`badge-sent-${msg.id}`}>
                            Sent
                          </Badge>
                        )}
                        {recipientStatus?.isRead && (
                          <Badge variant="outline" className="flex items-center gap-1" data-testid={`badge-read-${msg.id}`}>
                            <MailOpen className="h-3 w-3" />
                            Read
                          </Badge>
                        )}
                        {recipientStatus?.isAccomplished && (
                          <Badge className="flex items-center gap-1 bg-green-600" data-testid={`badge-accomplished-${msg.id}`}>
                            <CheckCircle className="h-3 w-3" />
                            Accomplished
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-2 space-y-1">
                        <p data-testid={`text-sender-${msg.id}`}>
                          <strong>From:</strong> {getSenderName(msg.senderId)}
                        </p>
                        <p data-testid={`text-recipient-${msg.id}`}>
                          <strong>To:</strong> {getRecipientInfo(msg)} ({msg.recipientType})
                        </p>
                        <p className="flex items-center gap-1" data-testid={`text-sent-at-${msg.id}`}>
                          <Clock className="h-3 w-3" />
                          {msg.sentAt ? format(new Date(msg.sentAt), 'PPp') : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <p className="whitespace-pre-wrap" data-testid={`text-body-${msg.id}`}>{msg.message}</p>
                  
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {msg.attachments.map(att => (
                        <div key={att.id} className="p-3 bg-muted rounded-lg flex items-center gap-2" data-testid={`attachment-${att.id}`}>
                          <Paperclip className="h-4 w-4" />
                          <span className="text-sm">{att.fileName} - {att.fileType}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isReceived && recipientStatus && (
                    <div className="mt-4 flex gap-2">
                      {!recipientStatus.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkAsRead(msg.id)}
                          disabled={markAsReadMutation.isPending}
                          data-testid={`button-mark-read-${msg.id}`}
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          Mark as Read
                        </Button>
                      )}
                      {!recipientStatus.isAccomplished && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAsAccomplished(msg.id)}
                          disabled={markAsAccomplishedMutation.isPending}
                          data-testid={`button-mark-accomplished-${msg.id}`}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Mark as Accomplished
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

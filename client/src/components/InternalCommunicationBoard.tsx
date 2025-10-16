import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  Department,
  InternalMessage,
  MessageRecipient,
  MessageAttachment,
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

interface CurrentUser {
  id: number;
  username: string;
  role: string;
}

export default function InternalCommunicationBoard() {
  const { toast } = useToast();
  const [recipientType, setRecipientType] = useState<'department' | 'person'>(
    'department'
  );
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedPersons, setSelectedPersons] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>(
    'all'
  );

  // Attachment state
  const [attachmentType, setAttachmentType] = useState<
    'none' | 'sales_order' | 'email' | 'download' | 'training_assignment'
  >('none');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [isPullup, setIsPullup] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [selectedTraining, setSelectedTraining] = useState<string>('');
  const [trainingEmployees, setTrainingEmployees] = useState<number[]>([]);

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ['/api/auth/session'],
  });

  const currentUserId = currentUser?.id || 0;

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/departments'],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: messages = [], isLoading } = useQuery<MessageWithDetails[]>({
    queryKey: ['/api/internal-messages'],
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['/api/orders'],
  });

  const { data: trainingModules = [] } = useQuery<any[]>({
    queryKey: ['/api/training/modules'],
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
        title: 'Message sent',
        description: 'Your message has been sent successfully.',
      });
      resetForm();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async ({
      messageId,
      userId,
    }: {
      messageId: number;
      userId: number;
    }) => {
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
    mutationFn: async ({
      messageId,
      userId,
    }: {
      messageId: number;
      userId: number;
    }) => {
      return await apiRequest(
        `/api/internal-messages/${messageId}/accomplished`,
        {
          method: 'PATCH',
          body: JSON.stringify({ userId }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });
      toast({
        title: 'Marked as accomplished',
        description: 'Message marked as accomplished.',
      });
    },
  });

  const resetForm = () => {
    setRecipientType('department');
    setSelectedDepartment('');
    setSelectedPersons([]);
    setSubject('');
    setMessage('');
    setIsUrgent(false);
    setShowCompose(false);
    setAttachmentType('none');
    setSelectedOrderId('');
    setIsPullup(false);
    setEmailSubject('');
    setDownloadUrl('');
    setSelectedTraining('');
    setTrainingEmployees([]);
  };

  const handleToggleUser = (userId: number) => {
    setSelectedPersons((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPersons.length === users.length) {
      setSelectedPersons([]);
    } else {
      setSelectedPersons(users.map((u) => u.id));
    }
  };

  const handleSendMessage = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please provide both subject and message.',
        variant: 'destructive',
      });
      return;
    }

    // Handle training assignment
    if (attachmentType === 'training_assignment') {
      if (!selectedTraining) {
        toast({
          title: 'Validation Error',
          description: 'Please select a training module to assign.',
          variant: 'destructive',
        });
        return;
      }

      if (trainingEmployees.length === 0) {
        toast({
          title: 'Validation Error',
          description:
            'Please select at least one employee for training assignment.',
          variant: 'destructive',
        });
        return;
      }

      try {
        // Find the training module to get the ID for linking
        const trainingModule = trainingModules.find(
          (m: any) => m.title === selectedTraining
        );
        const moduleLink = trainingModule
          ? `\n\nClick here to start: /training/modules/${trainingModule.id}`
          : '';

        // Create training assignments for each employee
        for (const userId of trainingEmployees) {
          const user = users.find((u) => u.id === userId);
          if (!user) continue;

          // Create training matrix entry
          await apiRequest('/api/training/matrix', {
            method: 'POST',
            body: JSON.stringify({
              employeeId: userId,
              employeeName: user.username,
              trainingName: selectedTraining,
              status: 'PENDING',
              notes: 'Assigned via internal communication',
            }),
          });

          // Send notification message to employee with module link
          await apiRequest('/api/internal-messages', {
            method: 'POST',
            body: JSON.stringify({
              senderId: currentUserId,
              senderName:
                users.find((u) => u.id === currentUserId)?.username ||
                'Unknown',
              recipientType: 'person',
              recipientName: user.username,
              recipientUserId: userId,
              subject: `Training Assignment: ${selectedTraining}`,
              message: `You have been assigned the training: ${selectedTraining}\n\n${message}${moduleLink}`,
              isUrgent: isUrgent,
            }),
          });
        }

        queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
        queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });

        toast({
          title: 'Training Assigned',
          description: `${selectedTraining} has been assigned to ${trainingEmployees.length} employee(s).`,
        });

        resetForm();
        return;
      } catch (error: any) {
        toast({
          title: 'Error',
          description:
            error.message || 'Failed to assign training. Please try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (recipientType === 'department' && !selectedDepartment) {
      toast({
        title: 'Validation Error',
        description: 'Please select a department.',
        variant: 'destructive',
      });
      return;
    }

    if (recipientType === 'person' && selectedPersons.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one recipient.',
        variant: 'destructive',
      });
      return;
    }

    const senderUser = users.find((u) => u.id === currentUserId);
    const senderName = senderUser ? senderUser.username : 'Unknown';

    if (recipientType === 'department') {
      const dept = departments.find(
        (d) => d.id === parseInt(selectedDepartment)
      );
      const recipientName = dept ? dept.name : '';

      const messageData: any = {
        senderId: currentUserId,
        senderName,
        recipientType,
        recipientName,
        subject,
        message,
        isUrgent,
        recipientDepartmentId: parseInt(selectedDepartment),
      };

      sendMessageMutation.mutate(messageData);
    } else {
      // Send individual message to each selected person
      for (const userId of selectedPersons) {
        const user = users.find((u) => u.id === userId);
        const recipientName = user ? user.username : '';

        const messageData: any = {
          senderId: currentUserId,
          senderName,
          recipientType,
          recipientName,
          subject,
          message,
          isUrgent,
          recipientUserId: userId,
        };

        await apiRequest('/api/internal-messages', {
          method: 'POST',
          body: JSON.stringify(messageData),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/internal-messages'] });
      toast({
        title: 'Messages sent',
        description: `Your message has been sent to ${selectedPersons.length} recipient(s).`,
      });
      resetForm();
    }
  };

  const handleMarkAsRead = (messageId: number) => {
    markAsReadMutation.mutate({ messageId, userId: currentUserId });
  };

  const handleMarkAsAccomplished = (messageId: number) => {
    markAsAccomplishedMutation.mutate({ messageId, userId: currentUserId });
  };

  const getRecipientInfo = (msg: MessageWithDetails) => {
    if (msg.recipientType === 'department' && msg.recipientDepartmentId) {
      const dept = departments.find((d) => d.id === msg.recipientDepartmentId);
      return dept ? dept.name : 'Unknown Department';
    } else if (msg.recipientType === 'person' && msg.recipientUserId) {
      const user = users.find((u) => u.id === msg.recipientUserId);
      return user ? user.username : 'Unknown User';
    }
    return 'Unknown';
  };

  const getSenderName = (senderId: number) => {
    const user = users.find((u) => u.id === senderId);
    return user ? user.username : 'Unknown';
  };

  const getUserRecipientStatus = (msg: MessageWithDetails) => {
    const recipient = msg.recipients?.find((r) => r.userId === currentUserId);
    return recipient;
  };

  const filteredMessages = messages.filter((msg) => {
    if (filterType === 'sent') return msg.senderId === currentUserId;
    if (filterType === 'received') {
      return msg.recipients?.some((r) => r.userId === currentUserId);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {!showCompose ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Select
              value={filterType}
              onValueChange={(value: any) => setFilterType(value)}
            >
              <SelectTrigger
                className="w-[180px]"
                data-testid="select-message-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">
                  All Messages
                </SelectItem>
                <SelectItem value="sent" data-testid="filter-sent">
                  Sent
                </SelectItem>
                <SelectItem value="received" data-testid="filter-received">
                  Received
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => setShowCompose(true)}
            data-testid="button-compose"
          >
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
              <Select
                value={recipientType}
                onValueChange={(value: any) => setRecipientType(value)}
              >
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
                <Select
                  value={selectedDepartment}
                  onValueChange={setSelectedDepartment}
                >
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="Choose a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem
                        key={dept.id}
                        value={dept.id.toString()}
                        data-testid={`dept-${dept.id}`}
                      >
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>
                  Select Recipients ({selectedPersons.length} selected)
                </Label>
                <div className="border rounded-md p-3 max-h-60 overflow-y-auto space-y-2 bg-background">
                  <div className="flex items-center space-x-2 p-2 bg-muted rounded-md">
                    <Checkbox
                      id="select-all"
                      checked={
                        selectedPersons.length === users.length &&
                        users.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                    <Label
                      htmlFor="select-all"
                      className="font-bold cursor-pointer flex-1 text-foreground"
                    >
                      Select All ({users.length} users)
                    </Label>
                  </div>

                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md"
                    >
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={selectedPersons.includes(user.id)}
                        onCheckedChange={() => handleToggleUser(user.id)}
                        data-testid={`checkbox-user-${user.id}`}
                      />
                      <Label
                        htmlFor={`user-${user.id}`}
                        className="cursor-pointer flex-1 text-foreground"
                      >
                        {user.username}{' '}
                        {!user.isActive && (
                          <span className="text-muted-foreground">
                            (Inactive)
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
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

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Attachments
              </Label>

              <Select
                value={attachmentType}
                onValueChange={(value: any) => setAttachmentType(value)}
              >
                <SelectTrigger data-testid="select-attachment-type">
                  <SelectValue placeholder="No attachment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Attachment</SelectItem>
                  <SelectItem value="sales_order">Sales Order</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="download">Download/File</SelectItem>
                  <SelectItem value="training_assignment">
                    Training Assignment
                  </SelectItem>
                </SelectContent>
              </Select>

              {attachmentType === 'sales_order' && (
                <div className="space-y-2 pl-4 border-l-2">
                  <Select
                    value={selectedOrderId}
                    onValueChange={setSelectedOrderId}
                  >
                    <SelectTrigger data-testid="select-order">
                      <SelectValue placeholder="Select an order" />
                    </SelectTrigger>
                    <SelectContent>
                      {orders.slice(0, 50).map((order: any) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.id} -{' '}
                          {order.customer_name || 'Unknown Customer'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pullup"
                      checked={isPullup}
                      onCheckedChange={(checked) =>
                        setIsPullup(checked as boolean)
                      }
                      data-testid="checkbox-pullup"
                    />
                    <Label htmlFor="pullup" className="cursor-pointer">
                      Pullup Order
                    </Label>
                  </div>
                </div>
              )}

              {attachmentType === 'email' && (
                <div className="pl-4 border-l-2">
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject or reference"
                    data-testid="input-email-subject"
                  />
                </div>
              )}

              {attachmentType === 'download' && (
                <div className="pl-4 border-l-2">
                  <Input
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    placeholder="File URL or path"
                    data-testid="input-download-url"
                  />
                </div>
              )}

              {attachmentType === 'training_assignment' && (
                <div className="space-y-3 pl-4 border-l-2">
                  <div className="space-y-2">
                    <Label>Select Training Module</Label>
                    <Select
                      value={selectedTraining}
                      onValueChange={setSelectedTraining}
                    >
                      <SelectTrigger data-testid="select-training-module">
                        <SelectValue placeholder="Choose a training module" />
                      </SelectTrigger>
                      <SelectContent>
                        {trainingModules.map((module: any) => (
                          <SelectItem
                            key={module.id}
                            value={module.title}
                            data-testid={`training-${module.id}`}
                          >
                            {module.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Assign to Employees ({trainingEmployees.length} selected)
                    </Label>
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 bg-background">
                      <div className="flex items-center space-x-2 p-2 bg-muted rounded-md">
                        <Checkbox
                          id="select-all-training"
                          checked={
                            trainingEmployees.length === users.length &&
                            users.length > 0
                          }
                          onCheckedChange={() => {
                            if (trainingEmployees.length === users.length) {
                              setTrainingEmployees([]);
                            } else {
                              setTrainingEmployees(users.map((u) => u.id));
                            }
                          }}
                          data-testid="checkbox-select-all-training"
                        />
                        <Label
                          htmlFor="select-all-training"
                          className="font-bold cursor-pointer flex-1"
                        >
                          Select All
                        </Label>
                      </div>

                      {users.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md"
                        >
                          <Checkbox
                            id={`training-user-${user.id}`}
                            checked={trainingEmployees.includes(user.id)}
                            onCheckedChange={() => {
                              setTrainingEmployees((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((id) => id !== user.id)
                                  : [...prev, user.id]
                              );
                            }}
                            data-testid={`checkbox-training-user-${user.id}`}
                          />
                          <Label
                            htmlFor={`training-user-${user.id}`}
                            className="cursor-pointer flex-1"
                          >
                            {user.username}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="urgent"
                checked={isUrgent}
                onCheckedChange={(checked) => setIsUrgent(checked as boolean)}
                data-testid="checkbox-urgent"
              />
              <Label
                htmlFor="urgent"
                className="flex items-center gap-2 cursor-pointer"
              >
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Mark as Urgent
              </Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={resetForm}
                data-testid="button-cancel"
              >
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
              <p className="text-center text-muted-foreground">
                Loading messages...
              </p>
            </CardContent>
          </Card>
        ) : filteredMessages.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p
                className="text-center text-muted-foreground"
                data-testid="text-no-messages"
              >
                No messages to display
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredMessages.map((msg) => {
            const recipientStatus = getUserRecipientStatus(msg);
            const isReceived = msg.recipients?.some(
              (r) => r.userId === currentUserId
            );
            const isSent = msg.senderId === currentUserId;

            return (
              <Card
                key={msg.id}
                className={msg.isUrgent ? 'border-orange-500 border-2' : ''}
                data-testid={`card-message-${msg.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle
                          className="text-lg"
                          data-testid={`text-subject-${msg.id}`}
                        >
                          {msg.subject}
                        </CardTitle>
                        {msg.isUrgent && (
                          <Badge
                            variant="destructive"
                            className="flex items-center gap-1"
                            data-testid={`badge-urgent-${msg.id}`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Urgent
                          </Badge>
                        )}
                        {isSent && (
                          <Badge
                            variant="secondary"
                            data-testid={`badge-sent-${msg.id}`}
                          >
                            Sent
                          </Badge>
                        )}
                        {recipientStatus?.isRead && (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1"
                            data-testid={`badge-read-${msg.id}`}
                          >
                            <MailOpen className="h-3 w-3" />
                            Read
                          </Badge>
                        )}
                        {recipientStatus?.isAccomplished && (
                          <Badge
                            className="flex items-center gap-1 bg-green-600"
                            data-testid={`badge-accomplished-${msg.id}`}
                          >
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
                          <strong>To:</strong> {getRecipientInfo(msg)} (
                          {msg.recipientType})
                        </p>
                        <p
                          className="flex items-center gap-1"
                          data-testid={`text-sent-at-${msg.id}`}
                        >
                          <Clock className="h-3 w-3" />
                          {msg.sentAt
                            ? format(new Date(msg.sentAt), 'PPp')
                            : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <p
                    className="whitespace-pre-wrap"
                    data-testid={`text-body-${msg.id}`}
                  >
                    {msg.message}
                  </p>

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 bg-muted rounded-lg flex items-center gap-2"
                          data-testid={`attachment-${att.id}`}
                        >
                          <Paperclip className="h-4 w-4" />
                          <span className="text-sm">
                            {att.fileName} - {att.fileType}
                          </span>
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

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  MessageSquare,
  Users,
  Send,
  Eye,
  Save,
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  Phone,
  Globe,
  AtSign,
  MapPin,
  Loader2,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  customerType: string | null;
}

interface CustomerType {
  id: number;
  name: string;
  description: string | null;
}

interface Template {
  id: number;
  name: string;
  subject: string;
  content: string;
  category: string;
}

interface CompanySettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
}

interface MarketingMessage {
  id: number;
  subject: string;
  content: string;
  messageType: string;
  recipientCount: number;
  successCount: number;
  failedCount: number;
  customerTypeFilter: string | null;
  sentBy: string | null;
  sentAt: string;
  status: string;
}

export default function MarketingCommunications() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('compose');
  const [messageType, setMessageType] = useState<'email' | 'sms'>('email');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [page, setPage] = useState(1);

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ['/api/marketing/company-settings'],
  });

  const { data: customerTypes = [] } = useQuery<CustomerType[]>({
    queryKey: ['/api/marketing/customer-types'],
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/marketing/templates'],
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: [
      '/api/marketing/customers',
      customerTypeFilter,
      searchQuery,
      messageType === 'email' ? 'true' : undefined,
      messageType === 'sms' ? 'true' : undefined,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (customerTypeFilter && customerTypeFilter !== 'all') {
        params.set('customerType', customerTypeFilter);
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      if (messageType === 'email') {
        params.set('hasEmail', 'true');
      }
      if (messageType === 'sms') {
        params.set('hasPhone', 'true');
      }
      params.set('page', page.toString());
      params.set('limit', '50');

      const response = await fetch(`/api/marketing/customers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
  });

  const { data: recipientCount } = useQuery<{ count: number }>({
    queryKey: [
      '/api/marketing/customers/count',
      customerTypeFilter,
      messageType === 'email' ? 'true' : undefined,
      messageType === 'sms' ? 'true' : undefined,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (customerTypeFilter && customerTypeFilter !== 'all') {
        params.set('customerType', customerTypeFilter);
      }
      if (messageType === 'email') {
        params.set('hasEmail', 'true');
      }
      if (messageType === 'sms') {
        params.set('hasPhone', 'true');
      }
      const response = await fetch(`/api/marketing/customers/count?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch count');
      return response.json();
    },
  });

  const { data: historyData } = useQuery<{
    messages: MarketingMessage[];
    total: string;
    page: number;
    limit: number;
  }>({
    queryKey: ['/api/marketing/history'],
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: {
      subject: string;
      content: string;
      customerTypeFilter?: string;
      customerIds?: number[];
    }) => {
      const response = await fetch('/api/marketing/send-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send emails');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Emails Sent',
        description: `Successfully sent ${data.successCount} emails. ${data.failedCount} failed.`,
      });
      setSubject('');
      setContent('');
      setSelectedCustomerIds([]);
      setSelectAll(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      customerTypeFilter?: string;
      customerIds?: number[];
    }) => {
      const response = await fetch('/api/marketing/send-bulk-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send SMS');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'SMS Sent',
        description: `Successfully sent ${data.successCount} messages. ${data.failedCount} failed.`,
      });
      setContent('');
      setSelectedCustomerIds([]);
      setSelectAll(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; subject: string; content: string }) => {
      const response = await fetch('/api/marketing/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to save template');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Template Saved', description: 'Your template has been saved successfully.' });
      setShowTemplateDialog(false);
      setTemplateName('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    },
  });

  const handleSend = () => {
    if (messageType === 'email') {
      if (!subject.trim()) {
        toast({ title: 'Error', description: 'Please enter a subject line', variant: 'destructive' });
        return;
      }
      if (!content.trim()) {
        toast({ title: 'Error', description: 'Please enter message content', variant: 'destructive' });
        return;
      }

      sendEmailMutation.mutate({
        subject,
        content,
        customerTypeFilter: customerTypeFilter !== 'all' ? customerTypeFilter : undefined,
        customerIds: selectedCustomerIds.length > 0 ? selectedCustomerIds : undefined,
      });
    } else {
      if (!content.trim()) {
        toast({ title: 'Error', description: 'Please enter message content', variant: 'destructive' });
        return;
      }

      sendSmsMutation.mutate({
        content,
        customerTypeFilter: customerTypeFilter !== 'all' ? customerTypeFilter : undefined,
        customerIds: selectedCustomerIds.length > 0 ? selectedCustomerIds : undefined,
      });
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id.toString() === templateId);
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
    }
  };

  const handleCustomerSelect = (customerId: number) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const generateHtmlEmail = (plainContent: string, customerName: string = 'Valued Customer') => {
    const settings = companySettings || {
      companyName: 'AG Composites',
      companyAddress: '123 Business Street, City, ST 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@agcomposites.com',
      companyWebsite: 'www.agcomposites.com',
    };

    const personalizedContent = plainContent.replace(/\{\{name\}\}/g, customerName);
    const htmlContent = personalizedContent.replace(/\n/g, '<br>');

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="padding: 30px 40px; text-align: center; background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${settings.companyName}</h1>
        </div>
        <div style="padding: 40px;">
          <div style="color: #333333; font-size: 16px; line-height: 1.6;">
            ${htmlContent}
          </div>
        </div>
        <div style="padding: 30px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 10px 0; color: #1a365d; font-weight: 600; font-size: 18px; text-align: center;">
            ${settings.companyName}
          </p>
          <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px; text-align: center;">
            ${settings.companyAddress}
          </p>
          <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px; text-align: center;">
            ${settings.companyPhone}
          </p>
          <p style="margin: 0 0 5px 0; color: #2563eb; font-size: 14px; text-align: center;">
            ${settings.companyEmail}
          </p>
          <p style="margin: 0; color: #2563eb; font-size: 14px; text-align: center;">
            ${settings.companyWebsite}
          </p>
        </div>
      </div>
    `;
  };

  const customers = customersData?.customers || [];
  const totalPages = Math.ceil((customersData?.total || 0) / 50);

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Mail className="h-8 w-8 text-primary" />
          Marketing Communications
        </h1>
        <p className="text-muted-foreground mt-1">
          Send promotional emails and SMS messages to your customers
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="compose" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Compose Message
                  </CardTitle>
                  <CardDescription>
                    Create your marketing message to send to customers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={messageType === 'email' ? 'default' : 'outline'}
                      onClick={() => setMessageType('email')}
                      className="flex-1"
                      data-testid="button-email-type"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                    <Button
                      variant={messageType === 'sms' ? 'default' : 'outline'}
                      onClick={() => setMessageType('sms')}
                      className="flex-1"
                      data-testid="button-sms-type"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      SMS
                    </Button>
                  </div>

                  {messageType === 'email' && (
                    <div>
                      <Label htmlFor="subject">Subject Line</Label>
                      <Input
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Enter email subject..."
                        data-testid="input-subject"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="content">Message Content</Label>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        messageType === 'email'
                          ? 'Enter your email message...'
                          : 'Enter your SMS message (160 chars max)...'
                      }
                      rows={8}
                      maxLength={messageType === 'sms' ? 160 : undefined}
                      data-testid="textarea-content"
                    />
                    {messageType === 'sms' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {content.length}/160 characters
                      </p>
                    )}
                    {messageType === 'email' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Use {'{{name}}'} to personalize with customer name
                      </p>
                    )}
                  </div>

                  {messageType === 'email' && templates.length > 0 && (
                    <div>
                      <Label>Load from Template</Label>
                      <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Select a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {messageType === 'email' && (
                      <>
                        <Dialog open={showPreview} onOpenChange={setShowPreview}>
                          <DialogTrigger asChild>
                            <Button variant="outline" data-testid="button-preview">
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Email Preview</DialogTitle>
                            </DialogHeader>
                            <div
                              className="border rounded-lg p-4 bg-gray-50"
                              dangerouslySetInnerHTML={{ __html: generateHtmlEmail(content) }}
                            />
                          </DialogContent>
                        </Dialog>

                        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                          <DialogTrigger asChild>
                            <Button variant="outline" data-testid="button-save-template">
                              <Save className="h-4 w-4 mr-2" />
                              Save as Template
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Save as Template</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label htmlFor="template-name">Template Name</Label>
                                <Input
                                  id="template-name"
                                  value={templateName}
                                  onChange={(e) => setTemplateName(e.target.value)}
                                  placeholder="Enter template name..."
                                  data-testid="input-template-name"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={() =>
                                  saveTemplateMutation.mutate({
                                    name: templateName,
                                    subject,
                                    content,
                                  })
                                }
                                disabled={!templateName.trim() || saveTemplateMutation.isPending}
                                data-testid="button-confirm-save-template"
                              >
                                {saveTemplateMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4 mr-2" />
                                )}
                                Save Template
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}

                    <Button
                      onClick={handleSend}
                      disabled={sendEmailMutation.isPending || sendSmsMutation.isPending}
                      className="ml-auto"
                      data-testid="button-send"
                    >
                      {sendEmailMutation.isPending || sendSmsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send {messageType === 'email' ? 'Emails' : 'SMS'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Branding
                  </CardTitle>
                  <CardDescription>
                    This information will be included in all marketing emails
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{companySettings?.companyName || 'AG Composites'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{companySettings?.companyPhone || '(555) 123-4567'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AtSign className="h-4 w-4 text-muted-foreground" />
                      <span>{companySettings?.companyEmail || 'info@agcomposites.com'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {companySettings?.companyWebsite || 'www.agcomposites.com'}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {companySettings?.companyAddress ||
                          '123 Business Street, City, ST 12345'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Recipients
                  </CardTitle>
                  <CardDescription>
                    Select customers to receive this message
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Filter by Customer Type</Label>
                    <Select
                      value={customerTypeFilter}
                      onValueChange={(value) => {
                        setCustomerTypeFilter(value);
                        setPage(1);
                        setSelectedCustomerIds([]);
                        setSelectAll(false);
                      }}
                    >
                      <SelectTrigger data-testid="select-customer-type">
                        <SelectValue placeholder="All customer types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customer Types</SelectItem>
                        {customerTypes.map((type) => (
                          <SelectItem key={type.id} value={type.name}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search customers..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                      data-testid="input-search-customers"
                    />
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {selectedCustomerIds.length > 0
                          ? `${selectedCustomerIds.length} selected`
                          : `${recipientCount?.count || 0} eligible recipients`}
                      </span>
                      <Badge variant="secondary">
                        {messageType === 'email' ? 'With Email' : 'With Phone'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={selectAll}
                      onCheckedChange={(checked) => setSelectAll(checked as boolean)}
                      data-testid="checkbox-select-all"
                    />
                    <Label htmlFor="select-all" className="text-sm">
                      Select all visible customers
                    </Label>
                  </div>

                  <ScrollArea className="h-[300px] border rounded-lg">
                    {customersLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : customers.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No customers found
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {customers.map((customer) => (
                          <div
                            key={customer.id}
                            className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer"
                            onClick={() => handleCustomerSelect(customer.id)}
                            data-testid={`customer-row-${customer.id}`}
                          >
                            <Checkbox
                              checked={
                                selectAll || selectedCustomerIds.includes(customer.id)
                              }
                              onCheckedChange={() => handleCustomerSelect(customer.id)}
                              data-testid={`checkbox-customer-${customer.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {customer.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {messageType === 'email'
                                  ? customer.email
                                  : customer.phone}
                              </p>
                            </div>
                            {customer.customerType && (
                              <Badge variant="outline" className="text-xs">
                                {customer.customerType}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Message Templates
              </CardTitle>
              <CardDescription>
                Manage your saved email templates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No templates saved yet</p>
                  <p className="text-sm">
                    Create a message and save it as a template to reuse later
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id} data-testid={`template-row-${template.id}`}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>{template.subject}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{template.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSubject(template.subject);
                              setContent(template.content);
                              setActiveTab('compose');
                            }}
                            data-testid={`button-use-template-${template.id}`}
                          >
                            Use Template
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Campaign History
              </CardTitle>
              <CardDescription>View past marketing campaigns and their results</CardDescription>
            </CardHeader>
            <CardContent>
              {!historyData?.messages || historyData.messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No campaigns sent yet</p>
                  <p className="text-sm">Your campaign history will appear here</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Filter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.messages.map((message) => (
                      <TableRow key={message.id} data-testid={`history-row-${message.id}`}>
                        <TableCell>
                          {new Date(message.sentAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={message.messageType === 'email' ? 'default' : 'secondary'}>
                            {message.messageType === 'email' ? (
                              <Mail className="h-3 w-3 mr-1" />
                            ) : (
                              <MessageSquare className="h-3 w-3 mr-1" />
                            )}
                            {message.messageType}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {message.subject || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-green-600 flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {message.successCount}
                            </span>
                            {message.failedCount > 0 && (
                              <span className="text-red-600 flex items-center">
                                <XCircle className="h-3 w-3 mr-1" />
                                {message.failedCount}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={message.status === 'completed' ? 'default' : 'secondary'}
                          >
                            {message.status === 'completed' ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            {message.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {message.customerTypeFilter || 'All'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

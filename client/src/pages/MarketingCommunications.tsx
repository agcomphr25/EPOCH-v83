import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Filter,
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
  contentHtml: string | null;
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
    total: number;
  }>({
    queryKey: ['/api/marketing/history'],
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: {
      subject: string;
      content: string;
      contentHtml?: string;
      customerTypeFilter?: string;
      customerIds?: number[];
    }) => {
      const response = await apiRequest('/api/marketing/send-bulk-email', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Emails Sent',
        description: `Successfully sent ${data.successCount} of ${data.recipientCount} emails`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/history'] });
      setSubject('');
      setContent('');
      setSelectedCustomerIds([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send emails',
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
      const response = await apiRequest('/api/marketing/send-bulk-sms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'SMS Messages Sent',
        description: `Successfully sent ${data.successCount} of ${data.recipientCount} messages`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/history'] });
      setContent('');
      setSelectedCustomerIds([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send SMS messages',
        variant: 'destructive',
      });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      subject: string;
      content: string;
      contentHtml?: string;
    }) => {
      const response = await apiRequest('/api/marketing/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Template Saved',
        description: 'Message template saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/templates'] });
      setShowTemplateDialog(false);
      setTemplateName('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save template',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (selectAll && customersData?.customers) {
      setSelectedCustomerIds(customersData.customers.map((c) => c.id));
    } else if (!selectAll) {
      setSelectedCustomerIds([]);
    }
  }, [selectAll, customersData?.customers]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id.toString() === templateId);
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
    }
  };

  const handleSend = () => {
    if (messageType === 'email') {
      if (!subject.trim() || !content.trim()) {
        toast({
          title: 'Validation Error',
          description: 'Please enter both subject and message content',
          variant: 'destructive',
        });
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
        toast({
          title: 'Validation Error',
          description: 'Please enter message content',
          variant: 'destructive',
        });
        return;
      }

      sendSmsMutation.mutate({
        content,
        customerTypeFilter: customerTypeFilter !== 'all' ? customerTypeFilter : undefined,
        customerIds: selectedCustomerIds.length > 0 ? selectedCustomerIds : undefined,
      });
    }
  };

  const generateHtmlEmail = (text: string, settings?: CompanySettings) => {
    const company = settings || {
      companyName: 'AG Composites',
      companyAddress: '123 Business Street, City, ST 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@agcomposites.com',
      companyWebsite: 'www.agcomposites.com',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); border-radius: 8px 8px 0 0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${company.companyName}</h1>
                    <p style="margin: 5px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Premium Composite Solutions</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="font-size: 16px; line-height: 1.6; color: #333333;">
                ${text.replace(/\n/g, '<br>')}
              </div>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>
          
          <!-- Footer with Contact Info -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 15px; font-size: 14px; color: #64748b;">
                      <strong style="color: #1e3a5f;">${company.companyName}</strong>
                    </p>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                      <span style="display: inline-block; margin-right: 20px;">
                        📍 ${company.companyAddress}
                      </span>
                    </p>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                      <span style="display: inline-block; margin-right: 20px;">
                        📞 ${company.companyPhone}
                      </span>
                      <span style="display: inline-block;">
                        ✉️ ${company.companyEmail}
                      </span>
                    </p>
                    <p style="margin: 15px 0 0; font-size: 13px;">
                      <a href="https://${company.companyWebsite}" style="color: #2563eb; text-decoration: none;">
                        🌐 ${company.companyWebsite}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Copyright -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #1e3a5f; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.7);">
                © ${new Date().getFullYear()} ${company.companyName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  };

  const toggleCustomerSelection = (customerId: number) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
          <Mail className="h-8 w-8 text-primary" />
          Marketing Communications
        </h1>
        <p className="text-muted-foreground mt-1">
          Send promotional emails and SMS messages to your customers
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="compose" data-testid="tab-compose">
            <Send className="h-4 w-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Message Composition */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {messageType === 'email' ? (
                      <Mail className="h-5 w-5" />
                    ) : (
                      <MessageSquare className="h-5 w-5" />
                    )}
                    Compose Message
                  </CardTitle>
                  <CardDescription>
                    Create your marketing message to send to customers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      variant={messageType === 'email' ? 'default' : 'outline'}
                      onClick={() => setMessageType('email')}
                      className="flex-1"
                      data-testid="btn-email-type"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                    <Button
                      variant={messageType === 'sms' ? 'default' : 'outline'}
                      onClick={() => setMessageType('sms')}
                      className="flex-1"
                      data-testid="btn-sms-type"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      SMS
                    </Button>
                  </div>

                  {templates.length > 0 && (
                    <div>
                      <Label htmlFor="template">Use Template</Label>
                      <Select
                        value={selectedTemplate}
                        onValueChange={handleTemplateSelect}
                      >
                        <SelectTrigger id="template" data-testid="select-template">
                          <SelectValue placeholder="Select a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem
                              key={template.id}
                              value={template.id.toString()}
                            >
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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
                    <Label htmlFor="content">
                      Message Content
                      {messageType === 'sms' && (
                        <span className="text-muted-foreground ml-2">
                          ({content.length}/160 characters)
                        </span>
                      )}
                    </Label>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        messageType === 'email'
                          ? 'Enter your email message...\n\nUse {{name}} to personalize with customer name'
                          : 'Enter your SMS message (160 characters max)...'
                      }
                      rows={messageType === 'email' ? 10 : 4}
                      maxLength={messageType === 'sms' ? 160 : undefined}
                      data-testid="input-content"
                    />
                  </div>

                  <div className="flex gap-2">
                    {messageType === 'email' && (
                      <Dialog open={showPreview} onOpenChange={setShowPreview}>
                        <DialogTrigger asChild>
                          <Button variant="outline" data-testid="btn-preview">
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Email Preview</DialogTitle>
                          </DialogHeader>
                          <div
                            className="border rounded-lg"
                            dangerouslySetInnerHTML={{
                              __html: generateHtmlEmail(content, companySettings),
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                    )}

                    <Dialog
                      open={showTemplateDialog}
                      onOpenChange={setShowTemplateDialog}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" data-testid="btn-save-template">
                          <Save className="h-4 w-4 mr-2" />
                          Save as Template
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Save Message Template</DialogTitle>
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
                            disabled={
                              !templateName.trim() || saveTemplateMutation.isPending
                            }
                            data-testid="btn-confirm-save-template"
                          >
                            {saveTemplateMutation.isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Save Template
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>

              {/* Company Branding Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Branding
                  </CardTitle>
                  <CardDescription>
                    This information will be included in all emails
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
                      <span>
                        {companySettings?.companyEmail || 'info@agcomposites.com'}
                      </span>
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

            {/* Right Column - Customer Selection */}
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

                  <Separator />

                  <ScrollArea className="h-[300px]">
                    {customersLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {customersData?.customers.map((customer) => (
                          <label
                            key={customer.id}
                            className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedCustomerIds.includes(customer.id)}
                              onCheckedChange={() =>
                                toggleCustomerSelection(customer.id)
                              }
                              data-testid={`checkbox-customer-${customer.id}`}
                              id={`customer-${customer.id}`}
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
                          </label>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {customersData && customersData.total > 50 && (
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page} of {Math.ceil(customersData.total / 50)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= Math.ceil(customersData.total / 50)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleSend}
                    disabled={
                      sendEmailMutation.isPending ||
                      sendSmsMutation.isPending ||
                      (messageType === 'email' && (!subject.trim() || !content.trim())) ||
                      (messageType === 'sms' && !content.trim())
                    }
                    data-testid="btn-send"
                  >
                    {(sendEmailMutation.isPending || sendSmsMutation.isPending) ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send {messageType === 'email' ? 'Emails' : 'SMS Messages'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Message Templates</CardTitle>
              <CardDescription>
                Save and reuse message templates for your marketing campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No templates saved yet</p>
                  <p className="text-sm">
                    Create a message and save it as a template to get started
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => (
                    <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="secondary" className="w-fit">
                          {template.category}
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          Subject: {template.subject}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {template.content}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => {
                            handleTemplateSelect(template.id.toString());
                            setActiveTab('compose');
                          }}
                          data-testid={`btn-use-template-${template.id}`}
                        >
                          Use Template
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                View past marketing communications and their delivery status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!historyData?.messages || historyData.messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages sent yet</p>
                  <p className="text-sm">
                    Your sent marketing messages will appear here
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject / Content</TableHead>
                      <TableHead>Filter</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.messages.map((message) => (
                      <TableRow key={message.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(message.sentAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              message.messageType === 'email'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {message.messageType === 'email' ? (
                              <Mail className="h-3 w-3 mr-1" />
                            ) : (
                              <MessageSquare className="h-3 w-3 mr-1" />
                            )}
                            {message.messageType}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {message.subject || message.content.substring(0, 50)}
                        </TableCell>
                        <TableCell>
                          {message.customerTypeFilter || 'All'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              {message.successCount}
                            </span>
                            {message.failedCount > 0 && (
                              <span className="flex items-center gap-1 text-red-600">
                                <XCircle className="h-3 w-3" />
                                {message.failedCount}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              message.status === 'completed'
                                ? 'default'
                                : message.status === 'sending'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {message.status === 'completed' && (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            )}
                            {message.status === 'sending' && (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            {message.status}
                          </Badge>
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

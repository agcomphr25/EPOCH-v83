import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart3, 
  Edit, 
  Trash2, 
  Users, 
  TrendingUp, 
  Star, 
  MessageSquare,
  CheckCircle,
  Download,
  Filter,
  FileText
} from 'lucide-react';
import CustomerSatisfactionSurvey from '@/components/CustomerSatisfactionSurvey';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface Survey {
  id: number;
  title: string;
  description?: string;
  isActive: boolean;
  questions: any[];
  settings: any;
  createdAt: string;
  updatedAt: string;
}

interface SurveyResponse {
  id: number;
  surveyId: number;
  surveyTitle: string;
  customerId: number;
  customerName: string;
  customerEmail?: string;
  orderId?: string;
  responses: Record<string, any>;
  overallSatisfaction?: number;
  npsScore?: number;
  aggregateScore?: number;
  responseTimeSeconds?: number;
  isComplete: boolean;
  submittedAt?: string;
  createdAt: string;
}

interface Analytics {
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
  averageOverallSatisfaction: number;
  averageNpsScore: number;
  netPromoterScore: number;
  npsBreakdown: {
    promoters: number;
    passives: number;
    detractors: number;
  };
  averageResponseTimeMinutes: number;
}

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #333',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  section: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    fontWeight: 'bold',
    width: '30%',
  },
  value: {
    width: '70%',
  },
  question: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  questionText: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  answer: {
    color: '#333',
    marginLeft: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#999',
    fontSize: 9,
  },
});

// PDF Document Component
const SurveyResponsePDF = ({ response, survey }: { response: SurveyResponse; survey: Survey | null }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>Customer Satisfaction Survey Response</Text>
        <Text style={pdfStyles.subtitle}>{response.surveyTitle}</Text>
        <Text style={pdfStyles.subtitle}>
          Submitted: {response.submittedAt ? new Date(response.submittedAt).toLocaleDateString() : 'N/A'}
        </Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Customer Information</Text>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Name:</Text>
          <Text style={pdfStyles.value}>{response.customerName}</Text>
        </View>
        {response.customerEmail && (
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Email:</Text>
            <Text style={pdfStyles.value}>{response.customerEmail}</Text>
          </View>
        )}
        {response.orderId && (
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Order #:</Text>
            <Text style={pdfStyles.value}>{response.orderId}</Text>
          </View>
        )}
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Overall Scores</Text>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Aggregate Score:</Text>
          <Text style={pdfStyles.value}>{response.aggregateScore || 0}/50</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>NPS Score:</Text>
          <Text style={pdfStyles.value}>{response.npsScore}/10</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Survey Responses</Text>
        {survey?.questions.map((question: any, index: number) => {
          const answer = response.responses[question.id];
          if (!answer && answer !== 0) return null;
          
          return (
            <View key={question.id} style={pdfStyles.question}>
              <Text style={pdfStyles.questionText}>
                {index + 1}. {question.question}
              </Text>
              <Text style={pdfStyles.answer}>
                {typeof answer === 'number' ? `${answer}/10` : answer}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={pdfStyles.footer}>
        Generated on {new Date().toLocaleDateString()} • Customer Satisfaction Survey System
      </Text>
    </Page>
  </Document>
);

export default function CustomerSatisfaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [isTakeSurveyOpen, setIsTakeSurveyOpen] = useState(false);
  const [isEditResponseOpen, setIsEditResponseOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<SurveyResponse | null>(null);

  // Export response as PDF
  const exportResponseToPDF = async (response: SurveyResponse) => {
    try {
      const survey = surveys.find((s: Survey) => s.id === response.surveyId);
      const blob = await pdf(<SurveyResponsePDF response={response} survey={survey || null} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `survey-response-${response.customerName.replace(/\s+/g, '-')}-${response.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "PDF Downloaded",
        description: "Survey response has been exported as PDF.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export PDF",
        variant: "destructive",
      });
    }
  };

  // Fetch surveys
  const { data: surveys = [], isLoading: surveysLoading } = useQuery({
    queryKey: ['/api/customer-satisfaction/surveys'],
    queryFn: () => apiRequest('/api/customer-satisfaction/surveys'),
  });

  // Fetch responses
  const { data: responses = [], isLoading: responsesLoading } = useQuery({
    queryKey: ['/api/customer-satisfaction/responses'],
    queryFn: () => apiRequest('/api/customer-satisfaction/responses'),
  });

  // Fetch analytics
  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['/api/customer-satisfaction/analytics'],
    queryFn: () => apiRequest('/api/customer-satisfaction/analytics'),
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  // Delete response mutation
  const deleteResponse = useMutation({
    mutationFn: (responseId: number) =>
      apiRequest(`/api/customer-satisfaction/responses/${responseId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: "Response Deleted",
        description: "Survey response has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/analytics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete response",
        variant: "destructive",
      });
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Complete Survey Button */}
      <div className="flex justify-end">
        <Button 
          onClick={() => setIsTakeSurveyOpen(true)}
          data-testid="button-complete-survey"
        >
          <FileText className="h-4 w-4 mr-2" />
          Complete Survey
        </Button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Responses</p>
                  <p className="text-2xl font-bold">{analytics.totalResponses}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Completion Rate</p>
                  <p className="text-2xl font-bold">{analytics.completionRate?.toFixed(1) || '0'}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Avg Satisfaction</p>
                  <p className="text-2xl font-bold">{analytics.averageOverallSatisfaction?.toFixed(1) || '0'}/10</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">NPS Score</p>
                  <p className="text-2xl font-bold">{analytics.netPromoterScore?.toFixed(0) || '0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Responses */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Responses</CardTitle>
        </CardHeader>
        <CardContent>
          {responses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No survey responses yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {responses.slice(0, 5).map((response: SurveyResponse) => (
                <div key={response.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{response.customerName}</div>
                    <div className="text-sm text-gray-600">{response.surveyTitle}</div>
                    <div className="text-xs text-gray-500">
                      {response.submittedAt ? formatDate(response.submittedAt) : 'Draft'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {response.aggregateScore !== undefined && response.aggregateScore !== null && (
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">{response.aggregateScore}/50</span>
                      </div>
                    )}
                    <Badge variant={response.isComplete ? "default" : "secondary"}>
                      {response.isComplete ? "Complete" : "Draft"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );


  const renderResponses = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Survey Responses</h2>
        <div className="flex space-x-2">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {responses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Responses Yet</h3>
            <p className="text-gray-600">Customer responses will appear here once surveys are submitted.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Survey
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Satisfaction
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NPS
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {responses.map((response: SurveyResponse) => (
                    <tr key={response.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900">{response.customerName}</div>
                          {response.customerEmail && (
                            <div className="text-sm text-gray-500">{response.customerEmail}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {response.surveyTitle}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {response.aggregateScore !== undefined && response.aggregateScore !== null ? (
                          <div className="flex items-center space-x-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm">{response.aggregateScore}/50</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {response.npsScore !== null ? response.npsScore : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={response.isComplete ? "default" : "secondary"}>
                          {response.isComplete ? "Complete" : "Draft"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {response.submittedAt ? formatDate(response.submittedAt) : formatDate(response.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportResponseToPDF(response)}
                            className="text-green-600 hover:text-green-900"
                            title="Export to PDF"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingResponse(response);
                              setIsEditResponseOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit Response"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this response? This action cannot be undone.')) {
                                deleteResponse.mutate(response.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-900"
                            title="Delete Response"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics & Insights</h2>
      
      {analytics ? (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Responses</p>
                    <p className="text-3xl font-bold">{analytics.totalResponses}</p>
                    <p className="text-sm text-green-600">
                      {analytics.completedResponses} completed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Star className="h-8 w-8 text-yellow-600" />
                  <div>
                    <p className="text-sm text-gray-600">Avg Satisfaction</p>
                    <p className="text-3xl font-bold">{analytics.averageOverallSatisfaction?.toFixed(1) || '0'}</p>
                    <p className="text-sm text-gray-600">out of 10</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600">Net Promoter Score</p>
                    <p className="text-3xl font-bold">{analytics.netPromoterScore?.toFixed(0) || '0'}</p>
                    <p className="text-sm text-gray-600">
                      {analytics.npsBreakdown.promoters} promoters
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
            <p className="text-gray-600">Analytics will appear here once survey responses are collected.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customer Satisfaction</h1>
          <p className="text-gray-600">Manage surveys and analyze customer feedback</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="responses">{renderResponses()}</TabsContent>
        <TabsContent value="analytics">{renderAnalytics()}</TabsContent>
      </Tabs>

      {/* Take Survey Dialog */}
      <Dialog open={isTakeSurveyOpen} onOpenChange={setIsTakeSurveyOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Satisfaction Survey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedCustomer && (
              <div className="space-y-2">
                <Label>Select Customer</Label>
                <Select onValueChange={(value) => setSelectedCustomer(parseInt(value))}>
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Choose a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: any) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.name} {customer.email && `(${customer.email})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {selectedCustomer && (
              <CustomerSatisfactionSurvey
                customerId={selectedCustomer}
                onComplete={() => {
                  setIsTakeSurveyOpen(false);
                  setSelectedCustomer(null);
                  queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/analytics'] });
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Response Modal */}
      <Dialog open={isEditResponseOpen} onOpenChange={setIsEditResponseOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Survey Response</DialogTitle>
          </DialogHeader>
          
          {editingResponse && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded">
                <strong>Customer:</strong> {editingResponse.customerName}
                {editingResponse.customerEmail && ` (${editingResponse.customerEmail})`}
                <br />
                <strong>Survey:</strong> {editingResponse.surveyTitle}
                <br />
                <strong>Status:</strong> {editingResponse.isComplete ? 'Complete' : 'Draft'}
              </div>
              
              <CustomerSatisfactionSurvey
                surveyId={editingResponse.surveyId}
                customerId={editingResponse.customerId}
                orderId={editingResponse.orderId}
                existingResponse={editingResponse}
                onComplete={() => {
                  setIsEditResponseOpen(false);
                  setEditingResponse(null);
                  queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/analytics'] });
                  toast({
                    title: "Response Updated",
                    description: "Survey response has been updated successfully.",
                  });
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
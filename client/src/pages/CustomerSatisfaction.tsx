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
  Plus, 
  Edit, 
  Trash2, 
  Send, 
  Users, 
  TrendingUp, 
  Star, 
  MessageSquare,
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  Download,
  Filter
} from 'lucide-react';
import CustomerSatisfactionSurvey from '@/components/CustomerSatisfactionSurvey';

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

export default function CustomerSatisfaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [isCreateSurveyOpen, setIsCreateSurveyOpen] = useState(false);
  const [isTakeSurveyOpen, setIsTakeSurveyOpen] = useState(false);

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

  // Create default survey mutation
  const createDefaultSurvey = useMutation({
    mutationFn: () => apiRequest('/api/customer-satisfaction/surveys/create-default', {
      method: 'POST',
    }),
    onSuccess: () => {
      toast({
        title: "Survey Created",
        description: "Default customer satisfaction survey has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/surveys'] });
      setIsCreateSurveyOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create survey",
        variant: "destructive",
      });
    },
  });

  // Delete survey mutation
  const deleteSurvey = useMutation({
    mutationFn: (surveyId: number) => 
      apiRequest(`/api/customer-satisfaction/surveys/${surveyId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: "Survey Deleted",
        description: "Survey has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/surveys'] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete survey",
        variant: "destructive",
      });
    },
  });

  // Toggle survey active status
  const toggleSurveyStatus = useMutation({
    mutationFn: ({ surveyId, isActive }: { surveyId: number; isActive: boolean }) =>
      apiRequest(`/api/customer-satisfaction/surveys/${surveyId}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          title: selectedSurvey?.title,
          description: selectedSurvey?.description,
          questions: selectedSurvey?.questions,
          settings: selectedSurvey?.settings,
          isActive 
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Survey Updated",
        description: "Survey status has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/surveys'] });
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
                  <p className="text-2xl font-bold">{analytics.averageOverallSatisfaction?.toFixed(1) || '0'}/5</p>
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              onClick={() => setIsCreateSurveyOpen(true)}
              className="flex items-center space-x-2 h-auto p-4"
            >
              <Plus className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Create Survey</div>
                <div className="text-sm opacity-80">Start with default template</div>
              </div>
            </Button>

            <Button 
              variant="outline"
              onClick={() => setIsTakeSurveyOpen(true)}
              className="flex items-center space-x-2 h-auto p-4"
            >
              <Send className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Take Survey</div>
                <div className="text-sm opacity-60">Fill out as customer</div>
              </div>
            </Button>

            <Button 
              variant="outline"
              onClick={() => setActiveTab('analytics')}
              className="flex items-center space-x-2 h-auto p-4"
            >
              <BarChart3 className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">View Analytics</div>
                <div className="text-sm opacity-60">Detailed insights</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    {response.overallSatisfaction && (
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">{response.overallSatisfaction}/5</span>
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

  const renderSurveys = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Survey Management</h2>
        <Button onClick={() => setIsCreateSurveyOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Survey
        </Button>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Surveys Created</h3>
            <p className="text-gray-600 mb-4">Create your first customer satisfaction survey to start collecting feedback.</p>
            <Button onClick={() => setIsCreateSurveyOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Default Survey
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {surveys.map((survey: Survey) => (
            <Card key={survey.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{survey.title}</CardTitle>
                    {survey.description && (
                      <p className="text-sm text-gray-600 mt-1">{survey.description}</p>
                    )}
                  </div>
                  <Badge variant={survey.isActive ? "default" : "secondary"}>
                    {survey.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p>{survey.questions.length} questions</p>
                    <p>Created {formatDate(survey.createdAt)}</p>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSurvey(survey);
                        toggleSurveyStatus.mutate({
                          surveyId: survey.id,
                          isActive: !survey.isActive
                        });
                      }}
                    >
                      {survey.isActive ? (
                        <>
                          <XCircle className="h-4 w-4 mr-1" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSurvey(survey);
                        setIsTakeSurveyOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteSurvey.mutate(survey.id)}
                      disabled={deleteSurvey.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
                        {response.overallSatisfaction ? (
                          <div className="flex items-center space-x-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm">{response.overallSatisfaction}/5</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <p className="text-sm text-gray-600">out of 5.0</p>
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

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Avg Response Time</p>
                    <p className="text-3xl font-bold">{analytics.averageResponseTimeMinutes?.toFixed(0) || '0'}</p>
                    <p className="text-sm text-gray-600">minutes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* NPS Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Net Promoter Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {analytics.npsBreakdown.promoters}
                    </div>
                    <div className="text-sm text-green-600">Promoters (9-10)</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      {analytics.npsBreakdown.passives}
                    </div>
                    <div className="text-sm text-yellow-600">Passives (7-8)</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {analytics.npsBreakdown.detractors}
                    </div>
                    <div className="text-sm text-red-600">Detractors (0-6)</div>
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-600">
                    {analytics.netPromoterScore?.toFixed(0) || '0'}
                  </div>
                  <div className="text-sm text-gray-600">Overall NPS Score</div>
                </div>
              </div>
            </CardContent>
          </Card>
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="surveys">Surveys</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="surveys">{renderSurveys()}</TabsContent>
        <TabsContent value="responses">{renderResponses()}</TabsContent>
        <TabsContent value="analytics">{renderAnalytics()}</TabsContent>
      </Tabs>

      {/* Create Survey Dialog */}
      <Dialog open={isCreateSurveyOpen} onOpenChange={setIsCreateSurveyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Customer Satisfaction Survey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Create a comprehensive customer satisfaction survey with pre-configured questions covering 
              product quality, service, delivery, and Net Promoter Score.
            </p>
            <div className="flex space-x-2">
              <Button 
                onClick={() => createDefaultSurvey.mutate()}
                disabled={createDefaultSurvey.isPending}
                className="flex-1"
              >
                {createDefaultSurvey.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Default Survey
              </Button>
              <Button variant="outline" onClick={() => setIsCreateSurveyOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  <SelectTrigger>
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
                surveyId={selectedSurvey?.id}
                customerId={selectedCustomer}
                onComplete={() => {
                  setIsTakeSurveyOpen(false);
                  setSelectedCustomer(null);
                  setSelectedSurvey(null);
                  queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
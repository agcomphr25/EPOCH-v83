import { useState, useRef, lazy, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  FileText,
  Upload,
  Eye,
  X,
  AlertCircle as AlertCircleIcon,
  ClipboardList,
} from 'lucide-react';

const CustomerSatisfactionSurvey = lazy(() => import('@/components/CustomerSatisfactionSurvey'));

class SurveyErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Survey component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center space-y-4">
          <AlertCircleIcon className="h-12 w-12 text-red-400 mx-auto" />
          <h3 className="text-lg font-medium text-gray-900">Something went wrong</h3>
          <p className="text-gray-600 text-sm">The survey form encountered an error. Please try again.</p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Survey {
  id: string;
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
  scannedPdfPath?: string | null;
  orderId?: string;
  responses: Record<string, any>;
  overallSatisfaction?: number;
  npsScore?: number;
  aggregateScore?: number;
  responseTimeSeconds?: number;
  csrName?: string;
  isComplete: boolean;
  surveyDate?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface AuditLogEntry {
  id: number;
  action: string;
  responseId: number;
  customerName: string | null;
  surveyTitle: string | null;
  performedBy: string | null;
  reason: string | null;
  metadata: Record<string, any>;
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
  questionScores?: Array<{
    questionId: string;
    question: string;
    averageScore: number;
    responseCount: number;
    monthlyTrends: Array<{
      month: string;
      averageScore: number;
      count: number;
    }>;
  }>;
}

export default function CustomerSatisfaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [isTakeSurveyOpen, setIsTakeSurveyOpen] = useState(false);
  const [isEditResponseOpen, setIsEditResponseOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<SurveyResponse | null>(
    null
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingResponse, setDeletingResponse] = useState<SurveyResponse | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const exportResponseToPDF = async (response: SurveyResponse) => {
    try {
      const { generateSurveyResponsePDF } = await import('@/lib/customerSatisfactionPdf');
      const survey = surveys.find((s: Survey) => String(s.id) === String(response.surveyId));
      const blob = await generateSurveyResponsePDF(response, survey || null);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `survey-response-${(response.customerName || 'unknown').replace(/\s+/g, '-')}-${response.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'PDF Downloaded',
        description: 'Survey response has been exported as PDF.',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export PDF',
        variant: 'destructive',
      });
    }
  };

  // Fetch surveys from generic survey engine
  const { data: surveys = [], isLoading: surveysLoading } = useQuery({
    queryKey: ['/api/customer-satisfaction/surveys'],
    queryFn: () => apiRequest('/api/customer-satisfaction/surveys'),
  });

  // Fetch responses from generic survey engine
  const { data: responses = [], isLoading: responsesLoading } = useQuery({
    queryKey: ['/api/customer-satisfaction/responses'],
    queryFn: () => apiRequest('/api/customer-satisfaction/responses'),
  });

  // Fetch analytics from generic survey engine
  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['/api/customer-satisfaction/analytics'],
    queryFn: () => apiRequest('/api/customer-satisfaction/analytics'),
  });

  // Fetch customers (still needed for customer lookup display)
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  // Fetch audit log
  const { data: auditLog = [], isLoading: auditLogLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ['/api/customer-satisfaction/audit-log'],
    queryFn: () => apiRequest('/api/customer-satisfaction/audit-log'),
  });

  // Delete response mutation using generic survey engine
  const deleteResponse = useMutation({
    mutationFn: ({ responseId, reason }: { responseId: string; reason: string }) =>
      apiRequest(`/api/customer-satisfaction/responses/${responseId}`, {
        method: 'DELETE',
        body: { reason },
      }),
    onSuccess: () => {
      toast({
        title: 'Response Deleted',
        description: 'Survey response has been deleted successfully.',
      });
      setIsDeleteDialogOpen(false);
      setDeletingResponse(null);
      setDeleteReason('');
      queryClient.invalidateQueries({
        queryKey: ['/api/customer-satisfaction/responses'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/customer-satisfaction/analytics'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/customer-satisfaction/audit-log'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Failed to delete response',
        variant: 'destructive',
      });
    },
  });

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploadingResponseId, setUploadingResponseId] = useState<number | null>(null);

  const uploadPdf = useMutation({
    mutationFn: async ({ responseId, file }: { responseId: number; file: File }) => {
      const formData = new FormData();
      formData.append('pdf', file);
      const res = await fetch(`/api/customer-satisfaction/responses/${responseId}/upload-pdf`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'PDF Uploaded', description: 'Hand-filled survey PDF has been attached.' });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
      setUploadingResponseId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Upload Failed', description: error.message || 'Failed to upload PDF', variant: 'destructive' });
      setUploadingResponseId(null);
    },
  });

  const removePdf = useMutation({
    mutationFn: (responseId: number) =>
      apiRequest(`/api/customer-satisfaction/responses/${responseId}/remove-pdf`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'PDF Removed', description: 'Uploaded PDF has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
    },
    onError: (error: any) => {
      toast({ title: 'Remove Failed', description: error.message || 'Failed to remove PDF', variant: 'destructive' });
    },
  });

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingResponseId) {
      uploadPdf.mutate({ responseId: uploadingResponseId, file });
    }
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Responses</p>
                  <p className="text-2xl font-bold">
                    {analytics.totalResponses}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {analytics.averageOverallSatisfaction?.toFixed(1) || '0'}/50
                  </p>
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
                  <p className="text-2xl font-bold">
                    {analytics.netPromoterScore?.toFixed(0) || '0'}
                  </p>
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
                <div
                  key={response.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{response.customerName}</div>
                    <div className="text-sm text-gray-600">
                      {response.surveyTitle}
                    </div>
                    <div className="text-xs text-gray-500">
                      {response.submittedAt
                        ? formatDate(response.submittedAt)
                        : 'Draft'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {response.aggregateScore !== undefined &&
                      response.aggregateScore !== null && (
                        <div className="flex items-center space-x-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm">
                            {response.aggregateScore}/50
                          </span>
                        </div>
                      )}
                    <Badge
                      variant={response.isComplete ? 'default' : 'secondary'}
                    >
                      {response.isComplete ? 'Complete' : 'Draft'}
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Responses Yet
            </h3>
            <p className="text-gray-600">
              Customer responses will appear here once surveys are submitted.
            </p>
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
                          <div className="font-medium text-gray-900">
                            {response.customerName}
                          </div>
                          {response.customerEmail && (
                            <div className="text-sm text-gray-500">
                              {response.customerEmail}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {response.surveyTitle}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {response.aggregateScore !== undefined &&
                        response.aggregateScore !== null ? (
                          <div className="flex items-center space-x-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm">
                              {response.aggregateScore}/50
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {response.npsScore !== null ? response.npsScore : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            response.isComplete ? 'default' : 'secondary'
                          }
                        >
                          {response.isComplete ? 'Complete' : 'Draft'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {response.surveyDate
                          ? formatDate(response.surveyDate)
                          : response.submittedAt
                            ? formatDate(response.submittedAt)
                            : formatDate(response.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2 flex-wrap gap-1">
                          {response.scannedPdfPath ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(response.scannedPdfPath!, '_blank')}
                                className="text-purple-600 hover:text-purple-900"
                                title="View Uploaded PDF"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm('Remove the uploaded PDF from this response?')) {
                                    removePdf.mutate(response.id);
                                  }
                                }}
                                className="text-orange-600 hover:text-orange-900"
                                title="Remove Uploaded PDF"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setUploadingResponseId(response.id);
                                pdfInputRef.current?.click();
                              }}
                              className="text-purple-600 hover:text-purple-900"
                              title="Upload Hand-Filled PDF"
                              disabled={uploadPdf.isPending}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          )}
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
                              setDeletingResponse(response);
                              setDeleteReason('');
                              setIsDeleteDialogOpen(true);
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
                    <p className="text-3xl font-bold">
                      {analytics.totalResponses}
                    </p>
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
                    <p className="text-3xl font-bold">
                      {analytics.averageOverallSatisfaction?.toFixed(1) || '0'}
                    </p>
                    <p className="text-sm text-gray-600">out of 50</p>
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
                    <p className="text-3xl font-bold">
                      {analytics.netPromoterScore?.toFixed(0) || '0'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {analytics.npsBreakdown.promoters} promoters
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Question-Level Analytics */}
          {analytics.questionScores && analytics.questionScores.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Question Breakdown</h3>
              <div className="grid grid-cols-1 gap-4">
                {analytics.questionScores.map((questionScore) => (
                  <Card
                    key={questionScore.questionId}
                    data-testid={`card-question-${questionScore.questionId}`}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-medium">
                        {questionScore.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Average Score Display */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">
                              Average Score
                            </p>
                            <p
                              className="text-2xl font-bold text-blue-600"
                              data-testid={`text-avg-score-${questionScore.questionId}`}
                            >
                              {questionScore.averageScore.toFixed(1)} / 10
                            </p>
                            <p className="text-xs text-gray-500">
                              {questionScore.responseCount} responses
                            </p>
                          </div>

                          {/* Progress Bar */}
                          <div className="flex-1 max-w-xs ml-8">
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                                style={{
                                  width: `${(questionScore.averageScore / 10) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3-Month Trend */}
                        <div className="border-t pt-4">
                          <p className="text-sm font-medium text-gray-700 mb-3">
                            3-Month Trend
                          </p>
                          <div className="grid grid-cols-3 gap-4">
                            {questionScore.monthlyTrends.map((trend, index) => (
                              <div
                                key={`${questionScore.questionId}-${trend.month}`}
                                className="bg-gray-50 rounded-lg p-3"
                                data-testid={`trend-${questionScore.questionId}-${index}`}
                              >
                                <p className="text-xs text-gray-600 mb-1">
                                  {trend.month}
                                </p>
                                <p className="text-lg font-semibold text-gray-900">
                                  {trend.averageScore > 0
                                    ? trend.averageScore.toFixed(1)
                                    : 'N/A'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {trend.count}{' '}
                                  {trend.count === 1 ? 'response' : 'responses'}
                                </p>
                                {/* Trend Indicator */}
                                {index <
                                  questionScore.monthlyTrends.length - 1 &&
                                  trend.averageScore > 0 && (
                                    <div className="mt-1">
                                      {trend.averageScore >
                                      questionScore.monthlyTrends[index + 1]
                                        .averageScore ? (
                                        <span className="text-xs text-green-600 flex items-center">
                                          <TrendingUp className="h-3 w-3 mr-1" />
                                          Up
                                        </span>
                                      ) : trend.averageScore <
                                        questionScore.monthlyTrends[index + 1]
                                          .averageScore ? (
                                        <span className="text-xs text-red-600 flex items-center">
                                          <TrendingUp className="h-3 w-3 mr-1 rotate-180" />
                                          Down
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-600">
                                          Stable
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Data Available
            </h3>
            <p className="text-gray-600">
              Analytics will appear here once survey responses are collected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const actionBadgeVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action === 'created') return 'default';
    if (action === 'deleted') return 'destructive';
    return 'secondary';
  };

  const renderAuditLog = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Audit Log</h2>
      {auditLogLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : auditLog.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Activity Yet</h3>
            <p className="text-gray-600">
              Actions on survey responses will be recorded here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Survey</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performed By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLog.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={actionBadgeVariant(entry.action)}>
                          {entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.customerName ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {entry.surveyTitle ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.performedBy ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                        {entry.reason ? (
                          <span className="italic">{entry.reason}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(entry.createdAt)}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Customer Satisfaction
          </h1>
          <p className="text-gray-600">
            Manage surveys and analyze customer feedback
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="responses">{renderResponses()}</TabsContent>
        <TabsContent value="analytics">{renderAnalytics()}</TabsContent>
        <TabsContent value="audit-log">{renderAuditLog()}</TabsContent>
      </Tabs>

      <input
        type="file"
        ref={pdfInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfFileChange}
      />

      {/* Delete Response Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDeleteDialogOpen(false);
          setDeletingResponse(null);
          setDeleteReason('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Survey Response</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {deletingResponse && (
              <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded">
                <strong>Customer:</strong> {deletingResponse.customerName}<br />
                <strong>Survey:</strong> {deletingResponse.surveyTitle}
              </div>
            )}
            <p className="text-sm text-gray-700">
              This action cannot be undone. Please provide a reason for deleting this response.
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for deletion <span className="text-red-500">*</span></Label>
              <Textarea
                id="delete-reason"
                placeholder="Enter the reason for deleting this response..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingResponse(null);
                setDeleteReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteReason.trim() || deleteResponse.isPending}
              onClick={() => {
                if (deletingResponse && deleteReason.trim()) {
                  deleteResponse.mutate({
                    responseId: String(deletingResponse.id),
                    reason: deleteReason.trim(),
                  });
                }
              }}
            >
              {deleteResponse.isPending ? 'Deleting...' : 'Delete Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Take Survey Dialog */}
      <Dialog open={isTakeSurveyOpen} onOpenChange={(open) => {
        setIsTakeSurveyOpen(open);
        if (!open) setSelectedCustomer(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Satisfaction Survey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedCustomer && (
              <div className="space-y-2">
                <Label>Select Customer</Label>
                <Select
                  onValueChange={(value) =>
                    setSelectedCustomer(parseInt(value))
                  }
                >
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Choose a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: any) => (
                      <SelectItem
                        key={customer.id}
                        value={customer.id.toString()}
                      >
                        {customer.name}{' '}
                        {customer.email && `(${customer.email})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCustomer && (
              <SurveyErrorBoundary onReset={() => setSelectedCustomer(null)}>
                <Suspense fallback={
                  <div className="p-6 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-600">Loading survey form...</p>
                  </div>
                }>
                  <CustomerSatisfactionSurvey
                    customerId={selectedCustomer}
                    onComplete={() => {
                      setIsTakeSurveyOpen(false);
                      setSelectedCustomer(null);
                      queryClient.invalidateQueries({
                        queryKey: ['/api/customer-satisfaction/responses'],
                      });
                      queryClient.invalidateQueries({
                        queryKey: ['/api/customer-satisfaction/analytics'],
                      });
                      queryClient.invalidateQueries({
                        queryKey: ['/api/customer-satisfaction/audit-log'],
                      });
                    }}
                  />
                </Suspense>
              </SurveyErrorBoundary>
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
                {editingResponse.customerEmail &&
                  ` (${editingResponse.customerEmail})`}
                <br />
                <strong>Survey:</strong> {editingResponse.surveyTitle}
                <br />
                <strong>Status:</strong>{' '}
                {editingResponse.isComplete ? 'Complete' : 'Draft'}
              </div>

              <Suspense fallback={
                <div className="p-6 text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-600">Loading survey form...</p>
                </div>
              }>
                <CustomerSatisfactionSurvey
                  surveyId={String(editingResponse.surveyId)}
                  customerId={editingResponse.customerId}
                  orderId={editingResponse.orderId}
                  existingResponse={editingResponse}
                  onComplete={() => {
                    setIsEditResponseOpen(false);
                    setEditingResponse(null);
                    queryClient.invalidateQueries({
                      queryKey: ['/api/customer-satisfaction/responses'],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ['/api/customer-satisfaction/analytics'],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ['/api/customer-satisfaction/audit-log'],
                    });
                    toast({
                      title: 'Response Updated',
                      description:
                        'Survey response has been updated successfully.',
                    });
                  }}
                />
              </Suspense>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

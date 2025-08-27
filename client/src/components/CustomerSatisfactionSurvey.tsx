import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Star, 
  Send, 
  Save, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  BarChart3
} from 'lucide-react';

interface SurveyQuestion {
  id: string;
  type: 'rating' | 'multiple_choice' | 'text' | 'textarea' | 'yes_no' | 'nps';
  question: string;
  required: boolean;
  options?: string[];
  scale?: {
    min: number;
    max: number;
    minLabel?: string;
    maxLabel?: string;
  };
}

interface Survey {
  id: number;
  title: string;
  description?: string;
  isActive: boolean;
  questions: SurveyQuestion[];
  settings: {
    allowAnonymous: boolean;
    sendEmailReminders: boolean;
    showProgressBar: boolean;
    autoSave: boolean;
  };
}

interface Customer {
  id: number;
  name: string;
  email?: string;
}

interface CustomerSatisfactionSurveyProps {
  surveyId?: number;
  customerId?: number;
  orderId?: string;
  onComplete?: (responseId: number) => void;
}

export default function CustomerSatisfactionSurvey({
  surveyId,
  customerId,
  orderId,
  onComplete
}: CustomerSatisfactionSurveyProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(customerId || null);

  // Fetch active surveys
  const { data: surveys = [], isLoading: surveysLoading } = useQuery({
    queryKey: ['/api/customer-satisfaction/surveys'],
    queryFn: () => apiRequest('/api/customer-satisfaction/surveys'),
  });

  // Fetch customers for selection
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  // Selected survey (either from prop or first active survey)
  const selectedSurvey = surveys.find((s: Survey) => s.id === surveyId) || 
                        surveys.find((s: Survey) => s.isActive) || 
                        null;

  // Submit survey response mutation
  const submitResponse = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/customer-satisfaction/responses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      toast({
        title: "Survey Submitted",
        description: "Thank you for your feedback!",
      });
      setResponses({});
      setStartTime(new Date());
      if (onComplete) {
        onComplete(response.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/customer-satisfaction/responses'] });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit survey response",
        variant: "destructive",
      });
    },
  });

  // Handle response change
  const handleResponseChange = (questionId: string, value: any) => {
    const newResponses = { ...responses, [questionId]: value };
    setResponses(newResponses);
    
    // Clear validation error for this question
    if (validationErrors[questionId]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[questionId];
        return newErrors;
      });
    }
  };

  // Handle survey submission
  const handleSubmit = () => {
    if (!selectedSurvey || !selectedCustomerId) {
      toast({
        title: "Error",
        description: "Please select a customer before submitting",
        variant: "destructive",
      });
      return;
    }

    // Validate all required questions
    const errors: Record<string, string> = {};
    selectedSurvey.questions.forEach((question: SurveyQuestion) => {
      if (question.required && (!responses[question.id] && responses[question.id] !== 0)) {
        errors[question.id] = 'This question is required';
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast({
        title: "Validation Error",
        description: "Please answer all required questions",
        variant: "destructive",
      });
      return;
    }

    // Calculate scores - get highest rating for overall satisfaction
    const productQuality = responses['product-quality'] || null;
    const recommendationLikelihood = responses['recommendation-likelihood'] || null;

    const responseData = {
      surveyId: selectedSurvey.id,
      customerId: selectedCustomerId,
      orderId,
      responses,
      overallSatisfaction: productQuality, // Use product quality as overall satisfaction
      npsScore: recommendationLikelihood, // Use recommendation as NPS equivalent
      responseTimeSeconds: Math.floor((new Date().getTime() - startTime.getTime()) / 1000),
      isComplete: true,
      submittedAt: new Date().toISOString(),
    };

    submitResponse.mutate(responseData);
  };

  // Render rating question
  const renderRatingQuestion = (question: SurveyQuestion) => {
    const scale = question.scale || { min: 1, max: 5 };
    const value = responses[question.id];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{scale.minLabel}</span>
          <span className="text-sm text-gray-600">{scale.maxLabel}</span>
        </div>
        <div className="flex justify-center space-x-2">
          {Array.from({ length: scale.max - scale.min + 1 }, (_, i) => {
            const rating = scale.min + i;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => handleResponseChange(question.id, rating)}
                className={`p-2 rounded-full transition-colors ${
                  value === rating
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                {question.type === 'nps' ? (
                  <span className="text-sm font-medium">{rating}</span>
                ) : (
                  <Star 
                    className={`h-6 w-6 ${value === rating ? 'fill-current' : ''}`} 
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="text-center">
          <span className="text-sm text-gray-600">
            {value ? `${value} / ${scale.max}` : 'Not rated'}
          </span>
        </div>
      </div>
    );
  };

  // Render NPS question
  const renderNPSQuestion = (question: SurveyQuestion) => {
    const value = responses[question.id];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Not at all likely</span>
          <span className="text-sm text-gray-600">Extremely likely</span>
        </div>
        <div className="grid grid-cols-11 gap-2">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleResponseChange(question.id, i)}
              className={`p-3 rounded-lg border-2 transition-all ${
                value === i
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <span className="text-sm font-medium">{i}</span>
            </button>
          ))}
        </div>
        <div className="text-center">
          <span className="text-sm text-gray-600">
            {value !== undefined ? `Score: ${value}` : 'Not rated'}
          </span>
        </div>
      </div>
    );
  };

  // Render question based on type
  const renderQuestion = (question: SurveyQuestion) => {
    const error = validationErrors[question.id];

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-lg font-medium">
            {question.question}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {error && (
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {question.type === 'rating' && renderRatingQuestion(question)}
        
        {question.type === 'nps' && renderNPSQuestion(question)}
        
        {question.type === 'multiple_choice' && (
          <RadioGroup
            value={responses[question.id] || ''}
            onValueChange={(value) => handleResponseChange(question.id, value)}
          >
            {question.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${question.id}-${index}`} />
                <Label htmlFor={`${question.id}-${index}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        
        {question.type === 'yes_no' && (
          <RadioGroup
            value={responses[question.id] || ''}
            onValueChange={(value) => handleResponseChange(question.id, value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id={`${question.id}-yes`} />
              <Label htmlFor={`${question.id}-yes`} className="flex items-center space-x-2">
                <ThumbsUp className="h-4 w-4 text-green-600" />
                <span>Yes</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id={`${question.id}-no`} />
              <Label htmlFor={`${question.id}-no`} className="flex items-center space-x-2">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                <span>No</span>
              </Label>
            </div>
          </RadioGroup>
        )}
        
        {question.type === 'text' && (
          <Input
            value={responses[question.id] || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            placeholder="Enter your response..."
            className={error ? "border-red-500" : ""}
          />
        )}
        
        {question.type === 'textarea' && (
          <Textarea
            value={responses[question.id] || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            placeholder="Enter your response..."
            rows={4}
            className={error ? "border-red-500" : ""}
          />
        )}
      </div>
    );
  };

  if (surveysLoading || customersLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedSurvey) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">No Active Survey</h3>
              <p className="text-gray-600">There are no active customer satisfaction surveys available.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <span>{selectedSurvey.title}</span>
          </CardTitle>
          {selectedSurvey.description && (
            <p className="text-gray-600">{selectedSurvey.description}</p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Customer Selection */}
          <div className="space-y-2">
            <Label htmlFor="customer">Select Customer *</Label>
            <Select 
              value={selectedCustomerId?.toString() || ""} 
              onValueChange={(value) => setSelectedCustomerId(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Search and select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer: Customer) => (
                  <SelectItem key={customer.id} value={customer.id.toString()}>
                    {customer.name} {customer.email && `(${customer.email})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* All Questions */}
          <div className="space-y-6">
            {selectedSurvey.questions.map((question: SurveyQuestion, index: number) => (
              <div key={question.id} className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-3">
                  <Label className="text-base font-medium">
                    {index + 1}. {question.question}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  
                  {validationErrors[question.id] && (
                    <div className="flex items-center space-x-2 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{validationErrors[question.id]}</span>
                    </div>
                  )}

                  {question.type === 'rating' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>{question.scale?.minLabel}</span>
                        <span>{question.scale?.maxLabel}</span>
                      </div>
                      <div className="flex justify-center space-x-1">
                        {Array.from({ length: (question.scale?.max || 5) - (question.scale?.min || 1) + 1 }, (_, i) => {
                          const rating = (question.scale?.min || 1) + i;
                          return (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => handleResponseChange(question.id, rating)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                responses[question.id] === rating
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              {rating}
                            </button>
                          );
                        })}
                      </div>
                      {responses[question.id] && (
                        <div className="text-center text-sm text-gray-600">
                          Selected: {responses[question.id]} / {question.scale?.max || 5}
                        </div>
                      )}
                    </div>
                  )}

                  {question.type === 'textarea' && (
                    <Textarea
                      value={responses[question.id] || ''}
                      onChange={(e) => handleResponseChange(question.id, e.target.value)}
                      placeholder="Enter your comments..."
                      rows={3}
                      className={validationErrors[question.id] ? "border-red-500" : ""}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSubmit}
              disabled={submitResponse.isPending || !selectedCustomerId}
              size="lg"
              className="flex items-center space-x-2"
            >
              {submitResponse.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Submit Survey</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
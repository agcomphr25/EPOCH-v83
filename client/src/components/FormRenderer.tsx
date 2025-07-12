import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Send } from 'lucide-react';

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'autocomplete' | 'textarea' | 'checkbox';
  required: boolean;
  roles: string[];
  options?: string[];
}

interface Form {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}

interface FormRendererProps {
  formId: string;
  userRole: string;
}

export default function FormRenderer({ formId, userRole }: FormRendererProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Fetch form definition
  const { data: form, isLoading } = useQuery({
    queryKey: ['/api/forms', formId],
    queryFn: () => apiRequest(`/api/forms/${formId}`),
    enabled: !!formId
  });

  // Submit form mutation
  const submitFormMutation = useMutation({
    mutationFn: (data: Record<string, any>) => 
      apiRequest('/api/form-submissions', { 
        method: 'POST', 
        body: { formId, data } 
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Form submitted successfully' });
      setFormData({});
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit form', variant: 'destructive' });
    }
  });

  // Filter fields based on user role
  const visibleFields = form?.fields?.filter((field: FormField) => 
    field.roles.includes(userRole)
  ) || [];

  const handleInputChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = visibleFields.filter(field => field.required);
    const missingFields = requiredFields.filter(field => !formData[field.key]);
    
    if (missingFields.length > 0) {
      toast({ 
        title: 'Error', 
        description: `Please fill in required fields: ${missingFields.map(f => f.label).join(', ')}`,
        variant: 'destructive' 
      });
      return;
    }

    submitFormMutation.mutate(formData);
  };

  const renderField = (field: FormField) => {
    const value = formData[field.key] || '';
    
    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            required={field.required}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleInputChange(field.key, parseFloat(e.target.value) || '')}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            required={field.required}
          />
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            required={field.required}
          />
        );
      
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            required={field.required}
            className="min-h-[100px]"
          />
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.key}
              checked={value}
              onCheckedChange={(checked) => handleInputChange(field.key, checked)}
            />
            <Label htmlFor={field.key}>{field.label}</Label>
          </div>
        );
      
      case 'dropdown':
        return (
          <Select 
            value={value} 
            onValueChange={(newValue) => handleInputChange(field.key, newValue)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case 'autocomplete':
        return (
          <div>
            <Input
              value={value}
              onChange={(e) => handleInputChange(field.key, e.target.value)}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              required={field.required}
              list={`${field.key}-options`}
            />
            <datalist id={`${field.key}-options`}>
              {field.options?.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">Loading form...</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center text-red-600">Form not found</div>
      </div>
    );
  }

  if (visibleFields.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center text-gray-600">
          No fields visible for your role: {userRole}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{form.name}</CardTitle>
          {form.description && (
            <p className="text-gray-600">{form.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {visibleFields.map((field) => (
              <div key={field.key} className="space-y-2">
                {field.type !== 'checkbox' && (
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                )}
                {renderField(field)}
              </div>
            ))}
            
            <div className="pt-4 border-t">
              <Button 
                type="submit" 
                disabled={submitFormMutation.isPending}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                {submitFormMutation.isPending ? 'Submitting...' : 'Submit Form'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
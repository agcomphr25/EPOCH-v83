import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface FormField {
  id?: string;
  label: string;
  key: string;
  type: string;
  required: boolean;
  roles: string[];
  options?: string[];
}

interface FormData {
  id: number;
  name: string;
  description: string;
  fields: FormField[];
}

interface FormRendererProps {
  formId: string;
  userRole: string;
}

export default function FormRenderer({ formId, userRole }: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const queryClient = useQueryClient();

  // Fetch form definition
  const { data: formDef, isLoading } = useQuery<FormData>({
    queryKey: ['/api/forms', formId],
    queryFn: () => apiRequest(`/api/forms/${formId}`),
    enabled: !!formId,
  });

  // Initialize form data when form definition loads
  useEffect(() => {
    if (formDef) {
      const initial: Record<string, any> = {};
      formDef.fields
        .filter(f => f.roles.includes(userRole))
        .forEach(f => {
          initial[f.key] = f.type === 'checkbox' ? false : '';
        });
      setFormData(initial);
    }
  }, [formDef, userRole]);

  // Submit form mutation
  const submitFormMutation = useMutation({
    mutationFn: (data: { formId: number; data: Record<string, any> }) =>
      apiRequest('/api/form-submissions', { method: 'POST', body: data }),
    onSuccess: () => {
      toast.success('Submission saved');
      // Reset form
      const cleared: Record<string, any> = {};
      visibleFields.forEach(f => {
        cleared[f.key] = f.type === 'checkbox' ? false : '';
      });
      setFormData(cleared);
    },
    onError: () => toast.error('Submit failed'),
  });

  if (isLoading) return <div>Loading form...</div>;
  if (!formDef) return <div>Form not found</div>;

  const visibleFields = formDef.fields.filter(f => f.roles.includes(userRole));

  const handleChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const missingFields = visibleFields
      .filter(f => f.required && !formData[f.key])
      .map(f => f.label);
    
    if (missingFields.length > 0) {
      toast.error(`Required fields missing: ${missingFields.join(', ')}`);
      return;
    }

    submitFormMutation.mutate({
      formId: formDef.id,
      data: formData
    });
  };

  const renderField = (field: FormField) => {
    const value = formData[field.key] || '';
    const isRequired = field.required;

    switch (field.type) {
      case 'text':
        return (
          <Input
            type="text"
            required={isRequired}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            required={isRequired}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            required={isRequired}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            required={isRequired}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            checked={value}
            onCheckedChange={(checked) => handleChange(field.key, checked)}
          />
        );

      case 'dropdown':
        return (
          <Select
            value={value}
            onValueChange={(newValue) => handleChange(field.key, newValue)}
          >
            <SelectTrigger>
              <SelectValue placeholder="— Select —" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
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
              list={`dl-${field.key}`}
              required={isRequired}
              value={value}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
            <datalist id={`dl-${field.key}`}>
              {field.options?.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        );

      default:
        return (
          <Input
            type="text"
            required={isRequired}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        );
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{formDef.name}</CardTitle>
        {formDef.description && (
          <p className="text-sm text-gray-600">{formDef.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {visibleFields.map(field => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </Label>
              <div id={field.key}>
                {renderField(field)}
              </div>
            </div>
          ))}

          <Button 
            type="submit" 
            className="w-full"
            disabled={submitFormMutation.isPending}
          >
            {submitFormMutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
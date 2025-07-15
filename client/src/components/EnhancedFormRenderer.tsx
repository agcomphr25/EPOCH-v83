import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import html2pdf from 'html2pdf.js';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  FileText, 
  Download, 
  PenTool, 
  Eye,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';

interface FormElement {
  id: string;
  type: 'text' | 'input' | 'signature' | 'column' | 'repeat' | 'dropdown' | 'textarea' | 'checkbox';
  x: number;
  y: number;
  width: number;
  height: number;
  config: {
    label?: string;
    required?: boolean;
    visibleIf?: string;
    table?: string;
    column?: string;
    text?: string;
    placeholder?: string;
    options?: string[];
    key?: string;
  };
}

interface EnhancedForm {
  id: number;
  name: string;
  description?: string;
  categoryId?: number;
  tableName?: string;
  layout: FormElement[];
  version: number;
}

export default function EnhancedFormRenderer({ 
  formId, 
  userRole = 'user' 
}: { 
  formId: number;
  userRole?: string;
}) {
  const [formDef, setFormDef] = useState<EnhancedForm | null>(null);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);
  const sigPads = useRef<Record<string, any>>({});

  // Load form definition
  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        const response = await apiRequest(`/api/enhanced-forms/${formId}`);
        setFormDef(response);
        
        // Initialize form data
        const initData: Record<string, any> = {};
        (response.layout || []).forEach((el: FormElement) => {
          if (el.type === 'repeat') {
            initData[el.id] = [];
          } else if (el.type === 'signature') {
            initData[el.id] = '';
          } else if (el.type === 'checkbox') {
            initData[el.id] = false;
          } else {
            initData[el.config.key || el.id] = '';
          }
        });
        setData(initData);
      } catch (error) {
        toast.error('Failed to load form');
      } finally {
        setLoading(false);
      }
    };

    if (formId) {
      loadForm();
    }
  }, [formId]);

  // Cleanup signature pads on unmount
  useEffect(() => {
    return () => {
      sigPads.current = {};
    };
  }, []);

  // Handle form field changes
  const handleChange = (key: string, value: any) => {
    setData(prev => ({ ...prev, [key]: value }));
    // Clear error when user starts typing
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formDef?.layout) return false;

    formDef.layout.forEach(element => {
      if (element.config.required) {
        const key = element.config.key || element.id;
        const value = data[key];
        
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          newErrors[key] = `${element.config.label || 'This field'} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/api/enhanced-forms/submissions', {
        method: 'POST',
        body: { formId, data }
      });
      toast.success('Form submitted successfully');
      
      // Clear form after successful submission
      const initData: Record<string, any> = {};
      (formDef?.layout || []).forEach(el => {
        if (el.type === 'repeat') {
          initData[el.id] = [];
        } else if (el.type === 'signature') {
          initData[el.id] = '';
          // Clear signature pad
          const sigPad = sigPads.current[el.id];
          if (sigPad) {
            sigPad.clear();
          }
        } else if (el.type === 'checkbox') {
          initData[el.id] = false;
        } else {
          initData[el.config.key || el.id] = '';
        }
      });
      setData(initData);
    } catch (error) {
      toast.error('Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle print/PDF generation
  const handlePrint = () => {
    if (!formRef.current) return;
    
    const opt = {
      margin: 1,
      filename: `${formDef?.name || 'form'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().from(formRef.current).set(opt).save();
  };

  // Check if element should be visible based on conditions
  const isElementVisible = (element: FormElement): boolean => {
    if (!element.config.visibleIf) return true;
    
    try {
      // Simple condition evaluation - you might want to use a proper expression parser
      const condition = element.config.visibleIf.replace(/\b(\w+)\b/g, (match) => {
        const value = data[match];
        if (typeof value === 'string') return `"${value}"`;
        return String(value);
      });
      
      // Using Function constructor for safer evaluation than eval
      return new Function(`return ${condition}`)();
    } catch (error) {
      console.warn('Error evaluating visibility condition:', error);
      return true;
    }
  };

  // Render form element
  const renderElement = (element: FormElement) => {
    const key = element.config.key || element.id;
    const value = data[key];
    const error = errors[key];
    const isRequired = element.config.required;

    if (!isElementVisible(element)) {
      return null;
    }

    const commonProps = {
      id: key,
      className: error ? 'border-red-500' : '',
      'aria-invalid': !!error,
      'aria-describedby': error ? `${key}-error` : undefined
    };

    switch (element.type) {
      case 'text':
        return (
          <div key={element.id} className="mb-4">
            <div className="text-sm font-medium text-gray-900">
              {element.config.text || 'Text Element'}
            </div>
          </div>
        );

      case 'input':
        return (
          <div key={element.id} className="mb-4">
            <Label htmlFor={key} className="flex items-center gap-1">
              {element.config.label}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            <Input
              {...commonProps}
              value={value || ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={element.config.placeholder || element.config.label}
            />
            {error && (
              <p id={`${key}-error`} className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={element.id} className="mb-4">
            <Label htmlFor={key} className="flex items-center gap-1">
              {element.config.label}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            <Textarea
              {...commonProps}
              value={value || ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={element.config.placeholder || element.config.label}
              rows={4}
            />
            {error && (
              <p id={`${key}-error`} className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );

      case 'dropdown':
        return (
          <div key={element.id} className="mb-4">
            <Label htmlFor={key} className="flex items-center gap-1">
              {element.config.label}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            <Select value={value || ''} onValueChange={(val) => handleChange(key, val)}>
              <SelectTrigger className={error ? 'border-red-500' : ''}>
                <SelectValue placeholder={`Select ${element.config.label}`} />
              </SelectTrigger>
              <SelectContent>
                {(element.config.options || []).map(option => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && (
              <p id={`${key}-error`} className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div key={element.id} className="mb-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={key}
                checked={value || false}
                onChange={(e) => handleChange(key, e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <Label htmlFor={key} className="flex items-center gap-1">
                {element.config.label}
                {isRequired && <span className="text-red-500">*</span>}
              </Label>
            </div>
            {error && (
              <p id={`${key}-error`} className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );

      case 'signature':
        return (
          <div key={element.id} className="mb-4">
            <Label className="flex items-center gap-1">
              <PenTool className="h-4 w-4" />
              {element.config.label || 'Signature'}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            <div className="border border-gray-300 rounded-md p-2">
              <div className="w-full h-32 bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                <span className="text-gray-500">Signature pad temporarily disabled</span>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleChange(key, '');
                  }}
                >
                  Clear
                </Button>
                {value && (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Signed
                  </div>
                )}
              </div>
            </div>
            {error && (
              <p id={`${key}-error`} className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );

      case 'column':
        return (
          <div key={element.id} className="mb-4">
            <Label htmlFor={key}>
              {element.config.column || 'Database Column'}
            </Label>
            <Input
              {...commonProps}
              value={value || ''}
              readOnly
              className="bg-gray-50 cursor-not-allowed"
            />
          </div>
        );

      case 'repeat':
        return (
          <div key={element.id} className="mb-4">
            <Label className="flex items-center gap-1">
              {element.config.label || 'Repeat Group'}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            <div className="border border-gray-300 rounded-md p-4">
              <p className="text-sm text-gray-500">
                Repeat group functionality will be implemented based on specific requirements
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading form...</p>
        </CardContent>
      </Card>
    );
  }

  if (!formDef) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">Form not found</p>
          <p className="text-gray-600">The requested form could not be loaded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {formDef.name}
          </CardTitle>
          {formDef.description && (
            <p className="text-gray-600">{formDef.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            {formDef.layout
              .sort((a, b) => a.y - b.y || a.x - b.x) // Sort by position
              .map(renderElement)}

            <div className="flex justify-between items-center pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Print/PDF
              </Button>
              
              <Button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Submit Form
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
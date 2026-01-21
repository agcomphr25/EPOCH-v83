import { useState, useRef, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, FileText, Download, Eraser } from 'lucide-react';

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'select';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
}

interface InstanceData {
  instanceId: string;
  templateName: string;
  templateDescription: string | null;
  fieldDefs: FieldDef[];
  requiresSignature: boolean;
  existingValues: Record<string, any>;
  status: string;
  recipientName: string | null;
  recipientEmail: string | null;
}

export default function FillAndSignPage() {
  const { publicSignatureId } = useParams<{ publicSignatureId: string }>();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [hasSignature, setHasSignature] = useState(false);

  // Fetch instance data
  const { data: instanceData, isLoading, error } = useQuery<InstanceData>({
    queryKey: ['/api/pdf-templates/instances', publicSignatureId],
    enabled: !!publicSignatureId,
  });

  // Initialize form values from existing values and defaults
  useEffect(() => {
    if (instanceData) {
      const initialValues: Record<string, any> = { ...instanceData.existingValues };
      instanceData.fieldDefs.forEach((field) => {
        if (initialValues[field.name] === undefined && field.defaultValue) {
          initialValues[field.name] = field.defaultValue;
        }
      });
      setFormValues(initialValues);
    }
  }, [instanceData]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [instanceData]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { valuesJson: Record<string, any>; signatureDataUrl?: string }) => {
      return apiRequest(`/api/pdf-templates/instances/${publicSignatureId}/submit`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Form submitted successfully!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleFieldChange = (name: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const getSignatureDataUrl = (): string | undefined => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return undefined;
    return canvas.toDataURL('image/png');
  };

  const handleSubmit = () => {
    // Validate required fields
    if (instanceData) {
      for (const field of instanceData.fieldDefs) {
        if (field.required && !formValues[field.name]) {
          toast({
            title: 'Required field missing',
            description: `Please fill in: ${field.label}`,
            variant: 'destructive',
          });
          return;
        }
      }

      if (instanceData.requiresSignature && !hasSignature) {
        toast({
          title: 'Signature required',
          description: 'Please sign in the signature box',
          variant: 'destructive',
        });
        return;
      }
    }

    submitMutation.mutate({
      valuesJson: formValues,
      signatureDataUrl: getSignatureDataUrl(),
    });
  };

  const renderField = (field: FieldDef) => {
    const value = formValues[field.name] ?? '';

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className="min-h-[100px]"
          />
        );
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
            />
            <Label htmlFor={field.name} className="font-normal">{field.placeholder || 'Yes'}</Label>
          </div>
        );
      case 'select':
        return (
          <Select
            value={value}
            onValueChange={(val) => handleFieldChange(field.name, val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || 'Select...'} />
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
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        );
      case 'email':
        return (
          <Input
            type="email"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder || 'email@example.com'}
          />
        );
      case 'phone':
        return (
          <Input
            type="tel"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder || '(555) 555-5555'}
          />
        );
      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading form...</p>
        </div>
      </div>
    );
  }

  if (error || !instanceData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Form Not Found</h2>
            <p className="text-muted-foreground">
              This form link may be invalid or has expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (instanceData.status === 'signed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-semibold mb-2">Form Already Signed</h2>
            <p className="text-muted-foreground mb-6">
              This form has already been completed and signed.
            </p>
            <Button
              onClick={() => {
                window.open(`/api/pdf-templates/instances/${publicSignatureId}/signed-pdf`, '_blank');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Signed PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-semibold mb-2">Form Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for completing and signing this form.
            </p>
            <Button
              onClick={() => {
                window.open(`/api/pdf-templates/instances/${publicSignatureId}/signed-pdf`, '_blank');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Signed PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{instanceData.templateName}</CardTitle>
            {instanceData.templateDescription && (
              <CardDescription>{instanceData.templateDescription}</CardDescription>
            )}
            {instanceData.recipientName && (
              <p className="text-sm text-muted-foreground mt-2">
                For: {instanceData.recipientName}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Form Fields */}
            {instanceData.fieldDefs.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderField(field)}
              </div>
            ))}

            {/* Signature Canvas */}
            {instanceData.requiresSignature && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>
                    Signature <span className="text-red-500">*</span>
                  </Label>
                  <Button variant="ghost" size="sm" onClick={clearSignature}>
                    <Eraser className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
                <div className="border rounded-lg p-2 bg-white">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={150}
                    className="w-full border rounded cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Sign above using your mouse or finger
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full"
              size="lg"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Form'
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By submitting this form, you agree to the terms and conditions.
              Your signature will be electronically applied to the document.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

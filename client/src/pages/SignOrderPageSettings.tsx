import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Save, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

interface SignOrderSettings {
  pageTitle: string;
  pageDescription: string;
  signatureDisclaimer: string;
  successMessage: string;
  alreadySignedTitle: string;
  alreadySignedMessage: string;
  invalidLinkMessage: string;
  orderNotFoundMessage: string;
  updatedAt?: string;
  updatedBy?: string;
}

const FIELD_LABELS: Record<keyof Omit<SignOrderSettings, 'updatedAt' | 'updatedBy'>, { label: string; description: string; multiline: boolean }> = {
  pageTitle: {
    label: 'Page Title',
    description: 'The main heading shown at the top of the order signing page.',
    multiline: false,
  },
  pageDescription: {
    label: 'Page Description',
    description: 'The instruction text shown below the page title.',
    multiline: false,
  },
  signatureDisclaimer: {
    label: 'Signature Disclaimer',
    description: 'The legal text shown above the signature pad, explaining what the customer is agreeing to.',
    multiline: true,
  },
  successMessage: {
    label: 'Success Message',
    description: 'The message shown after the customer successfully signs the order.',
    multiline: false,
  },
  alreadySignedTitle: {
    label: 'Already Signed Title',
    description: 'The title shown when a customer revisits a link for an order that has already been signed.',
    multiline: false,
  },
  alreadySignedMessage: {
    label: 'Already Signed Message',
    description: 'The message shown when the order has already been signed.',
    multiline: false,
  },
  invalidLinkMessage: {
    label: 'Invalid Link Message',
    description: 'The message shown when the signature link is invalid or missing.',
    multiline: true,
  },
  orderNotFoundMessage: {
    label: 'Order Not Found Message',
    description: 'The message shown when the order cannot be found or the link has expired.',
    multiline: true,
  },
};

export default function SignOrderPageSettings() {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);

  const { data: settings, isLoading } = useQuery<SignOrderSettings>({
    queryKey: ['/api/sign-order-settings'],
  });

  const [formData, setFormData] = useState<SignOrderSettings | null>(null);

  const activeData = formData || settings;

  const updateField = (field: keyof SignOrderSettings, value: string) => {
    setFormData(prev => ({
      ...(prev || settings || {} as SignOrderSettings),
      [field]: value,
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SignOrderSettings>) => {
      return await apiRequest('/api/sign-order-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sign-order-settings'] });
      setFormData(null);
      toast({
        title: 'Settings Saved',
        description: 'Sign order page content has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Saving Settings',
        description: error.message || 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!activeData) return;
    saveMutation.mutate(activeData);
  };

  const hasChanges = formData !== null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sign Order Page Settings</h1>
          <p className="text-muted-foreground mt-1">
            Customize the text content that customers see on the order signing page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {settings?.updatedAt && (
        <p className="text-sm text-muted-foreground mb-4">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
          {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
        </p>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Page Content</CardTitle>
            <CardDescription>
              These fields control the text displayed on the public-facing order signing page that customers use to review and approve their orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((field) => {
              const config = FIELD_LABELS[field];
              return (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field} className="font-medium">
                    {config.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  {config.multiline ? (
                    <Textarea
                      id={field}
                      value={activeData?.[field] || ''}
                      onChange={(e) => updateField(field, e.target.value)}
                      rows={3}
                      className="resize-y"
                    />
                  ) : (
                    <Input
                      id={field}
                      value={activeData?.[field] || ''}
                      onChange={(e) => updateField(field, e.target.value)}
                    />
                  )}
                  {field !== 'orderNotFoundMessage' && <Separator className="mt-4" />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {showPreview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                This is an approximation of how the content will appear to customers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">Main Page View</h3>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">{activeData?.pageTitle}</h2>
                  <p className="text-muted-foreground">{activeData?.pageDescription}</p>
                </div>
                <Separator className="my-4" />
                <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                  [Order details, customer info, pricing would appear here]
                </p>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Digital Signature</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {activeData?.signatureDisclaimer}
                  </p>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-24 flex items-center justify-center text-muted-foreground text-sm">
                    [Signature pad]
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">After Signing</h3>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="text-green-800 dark:text-green-200 font-medium">
                    {activeData?.successMessage}
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">Already Signed View</h3>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-green-600 font-semibold">{activeData?.alreadySignedTitle}</span>
                </div>
                <p className="text-muted-foreground text-sm ml-7">{activeData?.alreadySignedMessage}</p>
              </div>

              <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">Invalid Link View</h3>
                <span className="text-red-600 font-semibold">Invalid Link</span>
                <p className="text-muted-foreground text-sm mt-1">{activeData?.invalidLinkMessage}</p>
              </div>

              <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">Order Not Found View</h3>
                <span className="text-red-600 font-semibold">Order Not Found</span>
                <p className="text-muted-foreground text-sm mt-1">{activeData?.orderNotFoundMessage}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

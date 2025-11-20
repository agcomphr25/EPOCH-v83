import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, FileText } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VendorPOSettings {
  id?: number;
  termsAndConditions: string;
  paymentTerms: string;
  shippingInstructions: string;
}

export default function VendorPOSettings() {
  const { toast } = useToast();
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [shippingInstructions, setShippingInstructions] = useState('');

  const { data: settings, isLoading } = useQuery<VendorPOSettings>({
    queryKey: ['/api/vendor-pos/settings'],
  });

  useEffect(() => {
    if (settings) {
      setTermsAndConditions(settings.termsAndConditions || '');
      setPaymentTerms(settings.paymentTerms || '');
      setShippingInstructions(settings.shippingInstructions || '');
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<VendorPOSettings>) => {
      return await apiRequest('/api/vendor-pos/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/settings'] });
      toast({
        title: 'Settings Updated',
        description: 'PO settings have been successfully saved.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update PO settings. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      termsAndConditions,
      paymentTerms,
      shippingInstructions,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Purchase Order Settings
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure default terms and conditions for vendor purchase orders
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
          data-testid="button-save-settings"
        >
          {updateSettingsMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Terms and Conditions</CardTitle>
            <CardDescription>
              Default terms and conditions that will appear at the bottom of all purchase orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
              placeholder="Enter default terms and conditions..."
              className="min-h-[150px]"
              data-testid="textarea-terms-conditions"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Terms</CardTitle>
            <CardDescription>
              Default payment terms for vendor purchase orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g., Net 30 days from invoice date..."
              className="min-h-[100px]"
              data-testid="textarea-payment-terms"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipping Instructions</CardTitle>
            <CardDescription>
              Default shipping and delivery instructions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={shippingInstructions}
              onChange={(e) => setShippingInstructions(e.target.value)}
              placeholder="e.g., Ship to warehouse dock, notify 24 hours before delivery..."
              className="min-h-[100px]"
              data-testid="textarea-shipping-instructions"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, FileText, Plus, Trash2, ListChecks } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VendorPOSettings {
  id?: number;
  termsAndConditions: string;
  paymentTerms: string;
  shippingInstructions: string;
}

interface OptionalSetting {
  id: number;
  name: string;
  description?: string;
}

export default function VendorPOSettings() {
  const { toast } = useToast();
  
  // Global Settings state
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [shippingInstructions, setShippingInstructions] = useState('');
  
  // Optional Settings state
  const [newSettingName, setNewSettingName] = useState('');
  const [newSettingDescription, setNewSettingDescription] = useState('');

  const { data: settings, isLoading } = useQuery<VendorPOSettings>({
    queryKey: ['/api/vendor-pos/settings'],
  });

  const { data: optionalSettings = [], isLoading: isLoadingOptional } = useQuery<OptionalSetting[]>({
    queryKey: ['/api/vendor-pos/optional-settings'],
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
        title: 'Global Settings Updated',
        description: 'PO global settings have been successfully saved.',
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

  const createOptionalSettingMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return await apiRequest('/api/vendor-pos/optional-settings', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/optional-settings'] });
      setNewSettingName('');
      setNewSettingDescription('');
      toast({
        title: 'Optional Setting Added',
        description: 'New optional setting has been created.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create optional setting. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteOptionalSettingMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/vendor-pos/optional-settings/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/optional-settings'] });
      toast({
        title: 'Optional Setting Deleted',
        description: 'Optional setting has been removed.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete optional setting. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSaveGlobal = () => {
    updateSettingsMutation.mutate({
      termsAndConditions,
      paymentTerms,
      shippingInstructions,
    });
  };

  const handleAddOptionalSetting = () => {
    if (!newSettingName.trim()) {
      toast({
        title: 'Error',
        description: 'Setting name is required.',
        variant: 'destructive',
      });
      return;
    }
    
    createOptionalSettingMutation.mutate({
      name: newSettingName.trim(),
      description: newSettingDescription.trim() || undefined,
    });
  };

  if (isLoading || isLoadingOptional) {
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
            Configure global and optional settings for vendor purchase orders
          </p>
        </div>
      </div>

      <Tabs defaultValue="global" className="w-full">
        <TabsList>
          <TabsTrigger value="global" data-testid="tab-global-settings">
            Global Settings
          </TabsTrigger>
          <TabsTrigger value="optional" data-testid="tab-optional-settings">
            Optional Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button
              onClick={handleSaveGlobal}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-global-settings"
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Global Settings
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
        </TabsContent>

        <TabsContent value="optional" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-blue-600" />
                Optional Settings Library
              </CardTitle>
              <CardDescription>
                Create optional settings that can be selected for individual POs. These are in addition to global settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Add New Optional Setting</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="setting-name">Setting Name *</Label>
                    <Input
                      id="setting-name"
                      value={newSettingName}
                      onChange={(e) => setNewSettingName(e.target.value)}
                      placeholder="e.g., Expedited Shipping, Special Packaging..."
                      data-testid="input-new-setting-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="setting-description">Description (Optional)</Label>
                    <Input
                      id="setting-description"
                      value={newSettingDescription}
                      onChange={(e) => setNewSettingDescription(e.target.value)}
                      placeholder="e.g., Rush delivery within 2 business days..."
                      data-testid="input-new-setting-description"
                    />
                  </div>
                  <Button
                    onClick={handleAddOptionalSetting}
                    disabled={createOptionalSettingMutation.isPending}
                    data-testid="button-add-optional-setting"
                  >
                    {createOptionalSettingMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Optional Setting
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Available Optional Settings ({optionalSettings.length})
                </h4>
                {optionalSettings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
                    No optional settings yet. Add one above to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {optionalSettings.map((setting) => (
                      <div
                        key={setting.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700"
                        data-testid={`optional-setting-${setting.id}`}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {setting.name}
                          </div>
                          {setting.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {setting.description}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteOptionalSettingMutation.mutate(setting.id)}
                          disabled={deleteOptionalSettingMutation.isPending}
                          data-testid={`button-delete-setting-${setting.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

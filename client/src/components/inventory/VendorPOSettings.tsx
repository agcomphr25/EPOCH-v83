import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CompanySettings {
  id?: number;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
}

interface VendorPOSettings {
  id?: number;
  contactName?: string;
  contactTitle?: string;
  contactPhone?: string;
  contactEmail?: string;
  termsAndConditions: string;
  paymentTerms: string;
  shippingInstructions: string;
}

interface OptionalSetting {
  id: number;
  name: string;
  statement: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function VendorPOSettings() {
  const { toast } = useToast();
  // Company Information (central)
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  // PO Contact Person
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // PO Terms
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [shippingInstructions, setShippingInstructions] = useState('');

  const { data: settings, isLoading } = useQuery<VendorPOSettings>({
    queryKey: ['/api/vendor-pos/settings'],
  });

  const { data: companySettingsData } = useQuery<CompanySettings>({
    queryKey: ['/api/vendor-pos/company-settings'],
  });

  useEffect(() => {
    if (settings) {
      setContactName(settings.contactName || '');
      setContactTitle(settings.contactTitle || '');
      setContactPhone(settings.contactPhone || '');
      setContactEmail(settings.contactEmail || '');
      setTermsAndConditions(settings.termsAndConditions || '');
      setPaymentTerms(settings.paymentTerms || '');
      setShippingInstructions(settings.shippingInstructions || '');
    }
  }, [settings]);

  useEffect(() => {
    if (companySettingsData) {
      setCompanyName(companySettingsData.companyName || '');
      setCompanyAddress(companySettingsData.companyAddress || '');
      setCompanyPhone(companySettingsData.companyPhone || '');
      setCompanyEmail(companySettingsData.companyEmail || '');
      setCompanyWebsite(companySettingsData.companyWebsite || '');
    }
  }, [companySettingsData]);

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

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: Partial<CompanySettings>) => {
      return await apiRequest('/api/vendor-pos/company-settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/company-settings'] });
    },
  });

  const handleSave = () => {
    // Save both company settings and PO settings
    updateCompanyMutation.mutate({
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyWebsite,
    });

    updateSettingsMutation.mutate({
      contactName,
      contactTitle,
      contactPhone,
      contactEmail,
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

      <Tabs defaultValue="global" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="global" data-testid="tab-global-settings">
            Global Settings
          </TabsTrigger>
          <TabsTrigger value="optional" data-testid="tab-optional-settings">
            Optional Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Company-wide contact information (updated in one place, used across all POs)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="company-name">Company Name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter your company name..."
                  data-testid="input-company-name"
                />
              </div>
              <div>
                <Label htmlFor="company-address">Company Address</Label>
                <Textarea
                  id="company-address"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Enter your company address..."
                  className="min-h-[80px]"
                  data-testid="textarea-company-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company-phone">Main Phone</Label>
                  <Input
                    id="company-phone"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-company-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="company-email">Main Email</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="contact@company.com"
                    data-testid="input-company-email"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="company-website">Website (Optional)</Label>
                <Input
                  id="company-website"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  placeholder="https://www.company.com"
                  data-testid="input-company-website"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Purchase Order Contact Person</CardTitle>
              <CardDescription>
                Specific contact person for vendor purchase orders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact-name">Contact Name</Label>
                  <Input
                    id="contact-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="John Smith"
                    data-testid="input-contact-name"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-title">Contact Title</Label>
                  <Input
                    id="contact-title"
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    placeholder="Purchasing Manager"
                    data-testid="input-contact-title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact-phone">Contact Phone</Label>
                  <Input
                    id="contact-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(555) 987-6543"
                    data-testid="input-contact-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email">Vendor PO Return Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="glenn@agadvanced.com"
                    data-testid="input-contact-email"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

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
        </TabsContent>

        <TabsContent value="optional" className="space-y-6 mt-4">
          <OptionalSettingsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Optional Settings Manager Component
function OptionalSettingsManager() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<OptionalSetting | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', statement: '' });

  const { data: optionalSettings = [], isLoading } = useQuery<OptionalSetting[]>({
    queryKey: ['/api/vendor-pos/optional-settings'],
    queryFn: () => apiRequest('/api/vendor-pos/optional-settings'),
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; statement: string }) => {
      return await apiRequest('/api/vendor-pos/optional-settings', {
        method: 'POST',
        body: JSON.stringify({ ...data, sortOrder: 0, isActive: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/optional-settings'] });
      toast({ title: 'Success', description: 'Optional setting created successfully.' });
      setIsDialogOpen(false);
      setFormData({ name: '', statement: '' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create optional setting.', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; statement: string } }) => {
      return await apiRequest(`/api/vendor-pos/optional-settings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/optional-settings'] });
      toast({ title: 'Success', description: 'Optional setting updated successfully.' });
      setIsDialogOpen(false);
      setEditingSetting(null);
      setFormData({ name: '', statement: '' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update optional setting.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/vendor-pos/optional-settings/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/optional-settings'] });
      toast({ title: 'Success', description: 'Optional setting deleted successfully.' });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete optional setting.', variant: 'destructive' });
    },
  });

  const handleOpenDialog = (setting?: OptionalSetting) => {
    if (setting) {
      setEditingSetting(setting);
      setFormData({ name: setting.name, statement: setting.statement });
    } else {
      setEditingSetting(null);
      setFormData({ name: '', statement: '' });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.statement) {
      toast({ title: 'Validation Error', description: 'Name and statement are required.', variant: 'destructive' });
      return;
    }

    if (editingSetting) {
      updateMutation.mutate({ id: editingSetting.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Optional Statements</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create reusable statements that can be added to individual purchase orders
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="button-add-optional-setting">
              <Plus className="h-4 w-4 mr-2" />
              Add Statement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSetting ? 'Edit' : 'Create'} Optional Statement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Hazmat Shipping, Rush Delivery"
                  data-testid="input-optional-setting-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="statement">Statement</Label>
                <Textarea
                  id="statement"
                  value={formData.statement}
                  onChange={(e) => setFormData({ ...formData, statement: e.target.value })}
                  placeholder="Enter the full statement text..."
                  className="min-h-[120px]"
                  data-testid="textarea-optional-setting-statement"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel-optional-setting">
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-optional-setting"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {optionalSettings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-center">
              No optional statements created yet.
              <br />
              Click "Add Statement" to create your first one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {optionalSettings.map((setting) => (
            <Card key={setting.id} data-testid={`card-optional-setting-${setting.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{setting.name}</CardTitle>
                    <CardDescription className="mt-2 whitespace-pre-wrap">
                      {setting.statement}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(setting)}
                      data-testid={`button-edit-optional-setting-${setting.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteId(setting.id)}
                      data-testid={`button-delete-optional-setting-${setting.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Optional Statement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this optional statement. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

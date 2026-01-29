import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Edit, Trash2, FileText, GripVertical, X } from 'lucide-react';
import { Link } from 'wouter';

interface FormField {
  fieldKey: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
  employeeFieldMapping?: string;
}

interface OnboardingForm {
  id: string;
  name: string;
  description: string | null;
  fieldsJson: Array<{
    name: string;
    label: string;
    type: string;
    required?: boolean;
    options?: string[];
    mappedToField?: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

const EMPLOYEE_FIELD_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zipCode', label: 'Zip Code' },
  { value: 'dateOfBirth', label: 'Date of Birth' },
  { value: 'startDate', label: 'Start Date' },
  { value: 'emergencyContact', label: 'Emergency Contact' },
  { value: 'emergencyPhone', label: 'Emergency Phone' },
];

export default function OnboardingFormsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<OnboardingForm | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });
  const [fields, setFields] = useState<FormField[]>([]);

  const { data: forms = [], isLoading } = useQuery<OnboardingForm[]>({
    queryKey: ['/api/onboarding/forms'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; isActive: boolean; fieldsJson: FormField[] }) => {
      return apiRequest('/api/onboarding/forms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/forms'] });
      toast({ title: 'Form created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; description: string; isActive: boolean; fieldsJson: FormField[] } }) => {
      return apiRequest(`/api/onboarding/forms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/forms'] });
      toast({ title: 'Form updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/onboarding/forms/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/forms'] });
      toast({ title: 'Form deactivated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to deactivate form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const openCreateDialog = () => {
    setEditingForm(null);
    setFormData({ name: '', description: '', isActive: true });
    setFields([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (form: OnboardingForm) => {
    setEditingForm(form);
    setFormData({
      name: form.name,
      description: form.description || '',
      isActive: form.isActive,
    });
    const mappedFields: FormField[] = (form.fieldsJson || []).map(f => ({
      fieldKey: f.name,
      label: f.label,
      type: (f.type === 'dropdown' ? 'select' : f.type) as FormField['type'],
      required: f.required || false,
      options: f.options,
      employeeFieldMapping: f.mappedToField,
    }));
    setFields(mappedFields);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingForm(null);
    setFields([]);
  };

  const addField = () => {
    const newField: FormField = {
      fieldKey: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
    };
    setFields([...fields, newField]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const invalidFields = fields.filter(f => !f.label.trim());
    if (invalidFields.length > 0) {
      toast({
        title: 'Invalid fields',
        description: 'All fields must have a label',
        variant: 'destructive',
      });
      return;
    }

    const data = {
      name: formData.name,
      description: formData.description,
      isActive: formData.isActive,
      fieldsJson: fields.map(f => ({
        ...f,
        fieldKey: f.fieldKey || f.label.toLowerCase().replace(/\s+/g, '_'),
      })),
    };

    if (editingForm) {
      updateMutation.mutate({ id: editingForm.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const activeForms = forms.filter(f => f.isActive);
  const inactiveForms = forms.filter(f => !f.isActive);

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/onboarding">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Intake Forms</h1>
          <p className="text-muted-foreground">Design forms to collect employee information during onboarding</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Form
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No intake forms yet</h3>
            <p className="text-muted-foreground mb-4">Create your first intake form to collect employee information</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeForms.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Active Forms</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeForms.map((form) => (
                  <Card key={form.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{form.name}</CardTitle>
                          {form.description && (
                            <CardDescription className="mt-1">{form.description}</CardDescription>
                          )}
                        </div>
                        <Badge className="bg-green-500">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground mb-4">
                        {form.fieldsJson?.length || 0} field(s)
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => openEditDialog(form)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteMutation.mutate(form.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {inactiveForms.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Inactive Forms</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inactiveForms.map((form) => (
                  <Card key={form.id} className="opacity-60">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{form.name}</CardTitle>
                        <Badge variant="secondary">Inactive</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openEditDialog(form)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm ? 'Edit Form' : 'Create New Form'}</DialogTitle>
            <DialogDescription>
              {editingForm 
                ? 'Update the intake form configuration and fields'
                : 'Design a new intake form for employee onboarding'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Form Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., New Hire Information"
                    required
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label htmlFor="isActive">Active</Label>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of what this form collects"
                  rows={2}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Form Fields</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addField}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>No fields added yet</p>
                    <Button type="button" variant="link" onClick={addField}>
                      Add your first field
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-start gap-3">
                          <GripVertical className="h-5 w-5 text-muted-foreground mt-2 flex-shrink-0" />
                          <div className="flex-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <Label className="text-xs">Label</Label>
                              <Input
                                value={field.label}
                                onChange={(e) => updateField(index, { label: e.target.value })}
                                placeholder="Field label"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Field Key</Label>
                              <Input
                                value={field.fieldKey}
                                onChange={(e) => updateField(index, { fieldKey: e.target.value })}
                                placeholder="field_key"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Type</Label>
                              <Select
                                value={field.type}
                                onValueChange={(value) => updateField(index, { type: value as FormField['type'] })}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="select">Dropdown</SelectItem>
                                  <SelectItem value="checkbox">Checkbox</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Map to Employee Field</Label>
                              <Select
                                value={field.employeeFieldMapping || ''}
                                onValueChange={(value) => updateField(index, { employeeFieldMapping: value || undefined })}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                  {EMPLOYEE_FIELD_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value || 'none'}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-6">
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={field.required}
                                onCheckedChange={(checked) => updateField(index, { required: checked })}
                              />
                              <Label className="text-xs">Required</Label>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeField(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {field.type === 'select' && (
                          <div className="mt-3 ml-8">
                            <Label className="text-xs">Options (comma-separated)</Label>
                            <Input
                              value={field.options?.join(', ') || ''}
                              onChange={(e) => updateField(index, { 
                                options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                              })}
                              placeholder="Option 1, Option 2, Option 3"
                              className="mt-1"
                            />
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingForm ? 'Save Changes' : 'Create Form'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

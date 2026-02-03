import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Edit, Trash2, Route, FileText, GripVertical, ArrowUp, ArrowDown, X, FileSignature, Settings } from 'lucide-react';
import { Link } from 'wouter';

interface OnboardingPath {
  id: string;
  name: string;
  pathType: string;
  pathPurpose: string;
  intakeFormId: string | null;
  documentFolderId: string | null;
  signatureAuthTemplateId: string | null;
  documentTemplateIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

interface OnboardingForm {
  id: string;
  name: string;
  isActive: boolean;
}

interface MediaFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

interface FillableTemplate {
  id: string;
  name: string;
  isActive: boolean;
}

export default function OnboardingPathsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<OnboardingPath | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    pathType: 'FULL_TIME',
    pathPurpose: 'ONBOARDING',
    intakeFormId: 'none',
    documentFolderId: '',
    signatureAuthTemplateId: '',
    documentTemplateIds: [] as string[],
    isActive: true,
  });

  const { data: paths = [], isLoading } = useQuery<OnboardingPath[]>({
    queryKey: ['/api/onboarding/paths'],
  });

  const { data: forms = [] } = useQuery<OnboardingForm[]>({
    queryKey: ['/api/onboarding/forms'],
  });

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ['/api/media/folders'],
  });

  const { data: fillableTemplates = [] } = useQuery<FillableTemplate[]>({
    queryKey: ['/api/fillable-pdf-templates'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/onboarding/paths', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          pathType: data.pathType,
          pathPurpose: data.pathPurpose,
          intakeFormId: data.intakeFormId && data.intakeFormId !== 'none' ? data.intakeFormId : null,
          documentFolderId: data.documentFolderId && data.documentFolderId !== 'none' ? data.documentFolderId : null,
          signatureAuthTemplateId: data.signatureAuthTemplateId || null,
          documentTemplateIds: data.documentTemplateIds.length > 0 ? data.documentTemplateIds : null,
          isActive: data.isActive,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/paths'] });
      toast({ title: 'Path created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create path', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest(`/api/onboarding/paths/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.name,
          pathType: data.pathType,
          pathPurpose: data.pathPurpose,
          intakeFormId: data.intakeFormId && data.intakeFormId !== 'none' ? data.intakeFormId : null,
          documentFolderId: data.documentFolderId && data.documentFolderId !== 'none' ? data.documentFolderId : null,
          signatureAuthTemplateId: data.signatureAuthTemplateId || null,
          documentTemplateIds: data.documentTemplateIds.length > 0 ? data.documentTemplateIds : null,
          isActive: data.isActive,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/paths'] });
      toast({ title: 'Path updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update path', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/onboarding/paths/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/paths'] });
      toast({ title: 'Path deactivated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to deactivate path', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const openCreateDialog = () => {
    setEditingPath(null);
    setFormData({
      name: '',
      pathType: 'FULL_TIME',
      pathPurpose: 'ONBOARDING',
      intakeFormId: 'none',
      documentFolderId: '',
      signatureAuthTemplateId: '',
      documentTemplateIds: [],
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (path: OnboardingPath) => {
    setEditingPath(path);
    setFormData({
      name: path.name,
      pathType: path.pathType,
      pathPurpose: path.pathPurpose || 'ONBOARDING',
      intakeFormId: path.intakeFormId || 'none',
      documentFolderId: path.documentFolderId || '',
      signatureAuthTemplateId: path.signatureAuthTemplateId || '',
      documentTemplateIds: path.documentTemplateIds || [],
      isActive: path.isActive,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingPath(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPath) {
      updateMutation.mutate({ id: editingPath.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addDocumentTemplate = (templateId: string) => {
    if (!formData.documentTemplateIds.includes(templateId)) {
      setFormData({
        ...formData,
        documentTemplateIds: [...formData.documentTemplateIds, templateId],
      });
    }
  };

  const removeDocumentTemplate = (templateId: string) => {
    setFormData({
      ...formData,
      documentTemplateIds: formData.documentTemplateIds.filter(id => id !== templateId),
    });
  };

  const moveTemplateUp = (index: number) => {
    if (index === 0) return;
    const newIds = [...formData.documentTemplateIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    setFormData({ ...formData, documentTemplateIds: newIds });
  };

  const moveTemplateDown = (index: number) => {
    if (index === formData.documentTemplateIds.length - 1) return;
    const newIds = [...formData.documentTemplateIds];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    setFormData({ ...formData, documentTemplateIds: newIds });
  };

  const getTemplateName = (templateId: string) => {
    const template = fillableTemplates.find(t => t.id === templateId);
    return template?.name || 'Unknown Template';
  };

  const activePaths = paths.filter(p => p.isActive);
  const inactivePaths = paths.filter(p => !p.isActive);
  const activeTemplates = fillableTemplates.filter(t => t.isActive);
  const availableTemplates = activeTemplates.filter(
    t => !formData.documentTemplateIds.includes(t.id) && t.id !== formData.signatureAuthTemplateId
  );

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
          <h1 className="text-2xl font-bold">Onboarding Paths</h1>
          <p className="text-muted-foreground">Configure onboarding workflows for different employee types</p>
        </div>
        <Link href="/onboarding/settings">
          <Button variant="outline" className="mr-2">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Link>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Path
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : paths.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Route className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No onboarding paths yet</h3>
            <p className="text-muted-foreground mb-4">Create your first onboarding path to get started</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Path
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activePaths.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Active Paths</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activePaths.map((path) => (
                  <Card key={path.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{path.name}</CardTitle>
                          <CardDescription className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline">
                              {path.pathType === 'FULL_TIME' ? 'Full-Time' : 'Contract'}
                            </Badge>
                            <Badge 
                              variant={path.pathPurpose === 'REHIRE' ? 'secondary' : 'default'}
                              className={path.pathPurpose === 'REHIRE' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}
                            >
                              {path.pathPurpose === 'REHIRE' ? 'Re-Hire' : 'Onboarding'}
                            </Badge>
                          </CardDescription>
                        </div>
                        <Badge className="bg-green-500">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <FileSignature className="h-4 w-4" />
                          {path.signatureAuthTemplateId ? (
                            <span>Signature auth configured</span>
                          ) : (
                            <span className="italic">No signature auth</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {path.documentTemplateIds && path.documentTemplateIds.length > 0 ? (
                            <span>{path.documentTemplateIds.length} document{path.documentTemplateIds.length !== 1 ? 's' : ''} configured</span>
                          ) : path.documentFolderId ? (
                            <span className="italic text-amber-600">Legacy folder mode</span>
                          ) : (
                            <span className="italic">No documents</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => openEditDialog(path)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteMutation.mutate(path.id)}
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

          {inactivePaths.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Inactive Paths</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inactivePaths.map((path) => (
                  <Card key={path.id} className="opacity-60">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{path.name}</CardTitle>
                        <Badge variant="secondary">Inactive</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openEditDialog(path)}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPath ? 'Edit Path' : 'Create New Path'}</DialogTitle>
            <DialogDescription>
              {editingPath 
                ? 'Update the onboarding path configuration'
                : 'Configure a new onboarding workflow'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Path Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Standard Full-Time Onboarding"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pathType">Employment Type</Label>
                <Select
                  value={formData.pathType}
                  onValueChange={(value) => setFormData({ ...formData, pathType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-Time Employee</SelectItem>
                    <SelectItem value="CONTRACT">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pathPurpose">Path Purpose</Label>
                <Select
                  value={formData.pathPurpose}
                  onValueChange={(value) => setFormData({ ...formData, pathPurpose: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONBOARDING">New Hire Onboarding</SelectItem>
                    <SelectItem value="REHIRE">Re-Hire (Returning Employee)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {formData.pathPurpose === 'REHIRE' 
                    ? 'Re-hire paths require selecting an existing inactive employee and will reactivate their account.' 
                    : 'Onboarding paths create new employee records and user accounts.'}
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Document Templates</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="signatureAuth">Signature Authorization Template</Label>
                  <Select
                    value={formData.signatureAuthTemplateId || 'none'}
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      signatureAuthTemplateId: value === 'none' ? '' : value 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select signature auth template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Use built-in consent)</SelectItem>
                      {activeTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select a PDF template for e-signature authorization consent, or use the built-in consent form.
                  </p>
                </div>

                <div className="space-y-2 mt-4">
                  <Label>HR Documents (Ordered)</Label>
                  
                  {formData.documentTemplateIds.length > 0 && (
                    <div className="border rounded-md divide-y">
                      {formData.documentTemplateIds.map((templateId, index) => (
                        <div 
                          key={templateId} 
                          className="flex items-center gap-2 p-2 bg-muted/30"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium w-6 text-center">{index + 1}</span>
                          <span className="flex-1 text-sm truncate">{getTemplateName(templateId)}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveTemplateUp(index)}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveTemplateDown(index)}
                              disabled={index === formData.documentTemplateIds.length - 1}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeDocumentTemplate(templateId)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {availableTemplates.length > 0 ? (
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value) addDocumentTemplate(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Add a document template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : formData.documentTemplateIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No fillable PDF templates available. Create templates in the Media Library first.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">All available templates have been added.</p>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Select HR documents in the order they should be signed during onboarding.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="isActive">Active</Label>
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
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
                {editingPath ? 'Save Changes' : 'Create Path'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

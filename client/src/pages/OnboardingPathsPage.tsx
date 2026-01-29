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
import { ArrowLeft, Plus, Edit, Trash2, Route, FileText, FolderOpen } from 'lucide-react';
import { Link } from 'wouter';

interface OnboardingPath {
  id: string;
  name: string;
  pathType: string;
  pathPurpose: string;
  intakeFormId: string | null;
  documentFolderId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

interface OnboardingForm {
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
    isActive: true,
  });

  const { data: paths = [], isLoading } = useQuery<OnboardingPath[]>({
    queryKey: ['/api/onboarding/paths'],
  });

  const { data: forms = [] } = useQuery<OnboardingForm[]>({
    queryKey: ['/api/onboarding/forms'],
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

  const activePaths = paths.filter(p => p.isActive);
  const inactivePaths = paths.filter(p => !p.isActive);

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
                          <FileText className="h-4 w-4" />
                          {path.intakeFormId ? (
                            <span>Intake form assigned</span>
                          ) : (
                            <span className="italic">No intake form</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          {path.documentFolderId ? (
                            <span>Document folder assigned</span>
                          ) : (
                            <span className="italic">No document folder</span>
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
        <DialogContent className="max-w-md">
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

              <div className="space-y-2">
                <Label htmlFor="intakeFormId">Intake Form (Optional)</Label>
                <Select
                  value={formData.intakeFormId}
                  onValueChange={(value) => setFormData({ ...formData, intakeFormId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an intake form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {forms.filter(f => f.isActive).map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
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

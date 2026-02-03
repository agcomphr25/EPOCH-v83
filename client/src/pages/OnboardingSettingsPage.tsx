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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Edit, Trash2, UserCheck, Settings, PenTool, Shield } from 'lucide-react';
import { Link } from 'wouter';

interface User {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface EmployerSigner {
  id: string;
  userId: number;
  displayNameOverride: string | null;
  isActive: boolean;
  createdAt: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export default function OnboardingSettingsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSigner, setEditingSigner] = useState<EmployerSigner | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [displayNameOverride, setDisplayNameOverride] = useState('');

  const { data: signers = [], isLoading: signersLoading } = useQuery<EmployerSigner[]>({
    queryKey: ['/api/onboarding/settings/employer-signers'],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const eligibleUsers = users.filter(
    u => ['ADMIN', 'OWNER'].includes(u.role) && !signers.some(s => s.userId === u.id)
  );

  const addSignerMutation = useMutation({
    mutationFn: async (data: { userId: number; displayNameOverride?: string }) => {
      return apiRequest('/api/onboarding/settings/employer-signers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/settings/employer-signers'] });
      toast({ title: 'Success', description: 'Employer signer added' });
      setIsAddDialogOpen(false);
      setSelectedUserId('');
      setDisplayNameOverride('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to add signer', variant: 'destructive' });
    },
  });

  const updateSignerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { displayNameOverride?: string; isActive?: boolean } }) => {
      return apiRequest(`/api/onboarding/settings/employer-signers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/settings/employer-signers'] });
      toast({ title: 'Success', description: 'Signer updated' });
      setEditingSigner(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update signer', variant: 'destructive' });
    },
  });

  const deleteSignerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/onboarding/settings/employer-signers/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/settings/employer-signers'] });
      toast({ title: 'Success', description: 'Signer removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove signer', variant: 'destructive' });
    },
  });

  const handleAddSigner = () => {
    if (!selectedUserId) return;
    addSignerMutation.mutate({
      userId: parseInt(selectedUserId),
      displayNameOverride: displayNameOverride || undefined,
    });
  };

  const handleUpdateSigner = () => {
    if (!editingSigner) return;
    updateSignerMutation.mutate({
      id: editingSigner.id,
      data: { displayNameOverride: displayNameOverride || undefined },
    });
  };

  const handleToggleActive = (signer: EmployerSigner) => {
    updateSignerMutation.mutate({
      id: signer.id,
      data: { isActive: !signer.isActive },
    });
  };

  const openEditDialog = (signer: EmployerSigner) => {
    setEditingSigner(signer);
    setDisplayNameOverride(signer.displayNameOverride || '');
  };

  const getSignerDisplayName = (signer: EmployerSigner) => {
    if (signer.displayNameOverride) return signer.displayNameOverride;
    if (signer.firstName || signer.lastName) {
      return `${signer.firstName || ''} ${signer.lastName || ''}`.trim();
    }
    return signer.username;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/onboarding-paths">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Onboarding Settings
          </h1>
          <p className="text-muted-foreground">Configure onboarding system settings</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                Authorized Employer Signers
              </CardTitle>
              <CardDescription>
                Users authorized to sign HR documents on behalf of the employer. Only Admin and Owner roles can be added.
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)} disabled={eligibleUsers.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Add Signer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {signersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : signers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No authorized employer signers configured.</p>
              <p className="text-sm mt-2">Add users who can sign HR documents on behalf of the company.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Signature Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signers.map((signer) => (
                  <TableRow key={signer.id}>
                    <TableCell>
                      <div className="font-medium">
                        {signer.firstName || signer.lastName
                          ? `${signer.firstName || ''} ${signer.lastName || ''}`.trim()
                          : signer.username}
                      </div>
                      <div className="text-sm text-muted-foreground">{signer.username}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PenTool className="h-4 w-4 text-muted-foreground" />
                        {getSignerDisplayName(signer)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={signer.role === 'OWNER' ? 'default' : 'secondary'}>
                        <Shield className="h-3 w-3 mr-1" />
                        {signer.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={signer.isActive}
                          onCheckedChange={() => handleToggleActive(signer)}
                        />
                        <span className={signer.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                          {signer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(signer)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Remove this signer?')) {
                              deleteSignerMutation.mutate(signer.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Authorized Employer Signer</DialogTitle>
            <DialogDescription>
              Select a user to authorize for signing HR documents on behalf of the company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      <div className="flex items-center gap-2">
                        <span>
                          {user.firstName || user.lastName
                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                            : user.username}
                        </span>
                        <Badge variant="outline" className="text-xs">{user.role}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eligibleUsers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  All eligible users (Admin/Owner roles) are already authorized.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Signature Display Name (Optional)</Label>
              <Input
                placeholder="e.g., John Smith, HR Director"
                value={displayNameOverride}
                onChange={(e) => setDisplayNameOverride(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                If not provided, the user's full name will be used on signatures.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSigner}
              disabled={!selectedUserId || addSignerMutation.isPending}
            >
              {addSignerMutation.isPending ? 'Adding...' : 'Add Signer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSigner} onOpenChange={(open) => !open && setEditingSigner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Signer Display Name</DialogTitle>
            <DialogDescription>
              Update the name that appears on signed documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Signature Display Name</Label>
              <Input
                placeholder="e.g., John Smith, HR Director"
                value={displayNameOverride}
                onChange={(e) => setDisplayNameOverride(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Leave blank to use the user's full name.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSigner(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateSigner}
              disabled={updateSignerMutation.isPending}
            >
              {updateSignerMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Shield, Plus, Trash2, User, ChevronDown, ChevronRight, Lock, Unlock, Globe, Building2, FolderOpen } from 'lucide-react';

interface Capability {
  id: number;
  key: string;
  description: string;
  category: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  capabilities: string[];
}

interface UserOverride {
  id: number;
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  capability_key: string;
  capability_description: string;
  effect: 'allow' | 'deny';
}

interface ScopedGrant {
  id: number;
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  capabilityKey: string;
  scopeType: 'GLOBAL' | 'DEPARTMENT' | 'PROJECT';
  department: string | null;
  projectId: string | null;
}

interface UserOption {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeDisplayName?: string;
}

function groupByCategory(caps: Capability[]) {
  const groups: Record<string, Capability[]> = {};
  for (const c of caps) {
    if (!groups[c.category]) groups[c.category] = [];
    groups[c.category].push(c);
  }
  return groups;
}

const SCOPE_TYPE_ICONS = {
  GLOBAL: <Globe className="h-3 w-3 text-blue-500" />,
  DEPARTMENT: <Building2 className="h-3 w-3 text-orange-500" />,
  PROJECT: <FolderOpen className="h-3 w-3 text-purple-500" />,
};

const SCOPE_TYPE_LABELS = {
  GLOBAL: 'Global',
  DEPARTMENT: 'Department',
  PROJECT: 'Project',
};

export default function RolesPermissionsPage() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideCapKey, setOverrideCapKey] = useState('');
  const [overrideEffect, setOverrideEffect] = useState<'allow' | 'deny'>('allow');

  // Scoped grant form state
  const [scopeUserId, setScopeUserId] = useState('');
  const [scopeCapKey, setScopeCapKey] = useState('');
  const [scopeType, setScopeType] = useState<'GLOBAL' | 'DEPARTMENT' | 'PROJECT'>('GLOBAL');
  const [scopeDepartment, setScopeDepartment] = useState('');
  const [scopeProjectId, setScopeProjectId] = useState('');

  const { data: roles = [], isLoading: rolesLoading, isError: rolesError } = useQuery<Role[]>({ queryKey: ['/api/permissions/roles'] });
  const { data: caps = [] } = useQuery<Capability[]>({ queryKey: ['/api/permissions/capabilities'] });
  const { data: overrides = [] } = useQuery<UserOverride[]>({ queryKey: ['/api/permissions/all-user-overrides'] });
  const { data: scopedGrants = [] } = useQuery<ScopedGrant[]>({ queryKey: ['/api/permissions/all-scoped-grants'] });
  const { data: users = [] } = useQuery<UserOption[]>({ queryKey: ['/api/users'] });

  const capGroups = groupByCategory(caps);

  const addRole = useMutation({
    mutationFn: () => apiRequest('/api/permissions/roles', { method: 'POST', body: { name: newRoleName, description: newRoleDesc } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/roles'] });
      setNewRoleName('');
      setNewRoleDesc('');
      toast({ title: 'Role created' });
    },
    onError: () => toast({ title: 'Failed to create role', variant: 'destructive' }),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: number) => apiRequest(`/api/permissions/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/roles'] });
      if (selectedRole) setSelectedRole(null);
      toast({ title: 'Role deleted' });
    },
    onError: () => toast({ title: 'Cannot delete system role', variant: 'destructive' }),
  });

  const toggleCapability = useMutation({
    mutationFn: async ({ roleId, capId, hasIt }: { roleId: number; capId: number; hasIt: boolean }) => {
      if (hasIt) {
        return apiRequest(`/api/permissions/roles/${roleId}/capabilities/${capId}`, { method: 'DELETE' });
      } else {
        return apiRequest(`/api/permissions/roles/${roleId}/capabilities`, { method: 'POST', body: { capabilityId: capId } });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/roles'] });
    },
  });

  const addOverride = useMutation({
    mutationFn: () => apiRequest('/api/permissions/user-overrides', {
      method: 'POST',
      body: {
        userId: parseInt(overrideUserId),
        capabilityKey: overrideCapKey,
        effect: overrideEffect,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/all-user-overrides'] });
      setOverrideUserId('');
      setOverrideCapKey('');
      toast({ title: 'Override saved' });
    },
    onError: () => toast({ title: 'Failed to save override', variant: 'destructive' }),
  });

  const removeOverride = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/permissions/user-overrides/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/permissions/all-user-overrides'] }),
  });

  const addScopedGrant = useMutation({
    mutationFn: () => apiRequest('/api/permissions/scoped-grants', {
      method: 'POST',
      body: {
        userId: parseInt(scopeUserId),
        capabilityKey: scopeCapKey,
        scopeType,
        department: scopeType === 'DEPARTMENT' ? scopeDepartment : null,
        projectId: scopeType === 'PROJECT' ? scopeProjectId : null,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/all-scoped-grants'] });
      setScopeUserId('');
      setScopeCapKey('');
      setScopeType('GLOBAL');
      setScopeDepartment('');
      setScopeProjectId('');
      toast({ title: 'Scoped grant added' });
    },
    onError: (err: any) => toast({
      title: err?.message?.includes('already exists') ? 'Grant already exists' : 'Failed to add scoped grant',
      variant: 'destructive',
    }),
  });

  const removeScopedGrant = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/permissions/scoped-grants/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/permissions/all-scoped-grants'] }),
  });

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const liveSelectedRole = selectedRole ? roles.find(r => r.id === selectedRole.id) ?? selectedRole : null;

  const isScopedGrantFormValid = () => {
    if (!scopeUserId || !scopeCapKey) return false;
    if (scopeType === 'DEPARTMENT' && !scopeDepartment.trim()) return false;
    if (scopeType === 'PROJECT' && !scopeProjectId.trim()) return false;
    return true;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Roles &amp; Permissions</h1>
          <p className="text-muted-foreground text-sm">
            Manage capability-based access control. Changes take effect on next login or page refresh.
          </p>
        </div>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="overrides">User Overrides</TabsTrigger>
          <TabsTrigger value="scoped">Scoped Grants</TabsTrigger>
        </TabsList>

        {/* ── Roles tab ─────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Role list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Roles</CardTitle>
                <CardDescription>Select a role to edit its capabilities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rolesLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {rolesError && (
                  <p className="text-sm text-destructive">Failed to load roles. Please refresh the page.</p>
                )}
                {roles.map(role => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                      liveSelectedRole?.id === role.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="font-medium">{role.name}</span>
                    <div className="flex items-center gap-1">
                      {role.isSystem && (
                        <Lock className="h-3 w-3 opacity-60" />
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {role.capabilities.length}
                      </Badge>
                    </div>
                  </button>
                ))}

                <Separator className="my-3" />

                {/* Create role */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">New Role</Label>
                  <Input
                    placeholder="Role name"
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={newRoleDesc}
                    onChange={e => setNewRoleDesc(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!newRoleName || addRole.isPending}
                    onClick={() => addRole.mutate()}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Create Role
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Capability editor */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {liveSelectedRole ? liveSelectedRole.name : 'Select a role'}
                    </CardTitle>
                    {liveSelectedRole && (
                      <CardDescription>{liveSelectedRole.description}</CardDescription>
                    )}
                  </div>
                  {liveSelectedRole && !liveSelectedRole.isSystem && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteRole.mutate(liveSelectedRole.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete Role
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!liveSelectedRole ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Select a role from the left to view and edit its capabilities.
                  </p>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {Object.entries(capGroups).sort().map(([category, categoryCaps]) => {
                        const expanded = expandedCategories.has(category);
                        const grantedInCategory = categoryCaps.filter(c =>
                          liveSelectedRole.capabilities.includes(c.key)
                        ).length;

                        return (
                          <div key={category} className="border rounded-lg overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between px-4 py-2 bg-muted/50 hover:bg-muted text-sm font-medium capitalize"
                              onClick={() => toggleCategory(category)}
                            >
                              <span className="flex items-center gap-2">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                {category.replace(/_/g, ' ')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {grantedInCategory}/{categoryCaps.length}
                              </Badge>
                            </button>

                            {expanded && (
                              <div className="divide-y">
                                {categoryCaps.map(cap => {
                                  const hasIt = liveSelectedRole.capabilities.includes(cap.key);
                                  return (
                                    <label
                                      key={cap.id}
                                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={hasIt}
                                        onCheckedChange={() =>
                                          toggleCapability.mutate({
                                            roleId: liveSelectedRole.id,
                                            capId: cap.id,
                                            hasIt,
                                          })
                                        }
                                        className="mt-0.5"
                                      />
                                      <div>
                                        <p className="text-sm font-mono font-medium">{cap.key}</p>
                                        <p className="text-xs text-muted-foreground">{cap.description}</p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── User Overrides tab ────────────────────────────────── */}
        <TabsContent value="overrides" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add override form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Override</CardTitle>
                <CardDescription>
                  Grant or deny a specific capability for an individual user, overriding their role.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>User</Label>
                  <Select value={overrideUserId} onValueChange={setOverrideUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.employeeDisplayName
                            ? `${u.employeeDisplayName} (${u.username})`
                            : u.username + (u.firstName ? ` — ${u.firstName} ${u.lastName}` : '')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Capability</Label>
                  <Select value={overrideCapKey} onValueChange={setOverrideCapKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select capability…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(capGroups).sort().map(([cat, categoryCaps]) => (
                        <div key={cat}>
                          <div className="px-2 py-1 text-xs text-muted-foreground uppercase font-semibold">
                            {cat}
                          </div>
                          {categoryCaps.map(c => (
                            <SelectItem key={c.id} value={c.key}>
                              {c.key}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Effect</Label>
                  <Select value={overrideEffect} onValueChange={v => setOverrideEffect(v as 'allow' | 'deny')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">
                        <span className="flex items-center gap-2">
                          <Unlock className="h-3 w-3 text-green-600" /> Allow
                        </span>
                      </SelectItem>
                      <SelectItem value="deny">
                        <span className="flex items-center gap-2">
                          <Lock className="h-3 w-3 text-red-600" /> Deny
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  disabled={!overrideUserId || !overrideCapKey || addOverride.isPending}
                  onClick={() => addOverride.mutate()}
                >
                  Save Override
                </Button>
              </CardContent>
            </Card>

            {/* Existing overrides */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Overrides</CardTitle>
                <CardDescription>
                  These overrides take precedence over the user's role permissions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overrides.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No user overrides configured yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(overrides as any[]).map((ov: any) => (
                      <div
                        key={ov.id}
                        className="flex items-center justify-between px-3 py-2 border rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {ov.username}
                              {ov.first_name ? ` (${ov.first_name} ${ov.last_name})` : ''}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground">{ov.capability_key}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={ov.effect === 'allow' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {ov.effect === 'allow' ? (
                              <Unlock className="h-3 w-3 mr-1" />
                            ) : (
                              <Lock className="h-3 w-3 mr-1" />
                            )}
                            {ov.effect}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeOverride.mutate(ov.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Scoped Grants tab ─────────────────────────────────── */}
        <TabsContent value="scoped" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add scoped grant form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Scoped Grant</CardTitle>
                <CardDescription>
                  Assign a capability to a user scoped to a specific department or project, or grant it globally.
                  ADMIN and OWNER roles bypass all scope checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>User</Label>
                  <Select value={scopeUserId} onValueChange={setScopeUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.employeeDisplayName
                            ? `${u.employeeDisplayName} (${u.username})`
                            : u.username + (u.firstName ? ` — ${u.firstName} ${u.lastName}` : '')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Capability</Label>
                  <Select value={scopeCapKey} onValueChange={setScopeCapKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select capability…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(capGroups).sort().map(([cat, categoryCaps]) => (
                        <div key={cat}>
                          <div className="px-2 py-1 text-xs text-muted-foreground uppercase font-semibold">
                            {cat}
                          </div>
                          {categoryCaps.map(c => (
                            <SelectItem key={c.id} value={c.key}>
                              {c.key}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Scope Type</Label>
                  <Select value={scopeType} onValueChange={v => setScopeType(v as 'GLOBAL' | 'DEPARTMENT' | 'PROJECT')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">
                        <span className="flex items-center gap-2">
                          <Globe className="h-3 w-3 text-blue-500" /> Global — applies everywhere
                        </span>
                      </SelectItem>
                      <SelectItem value="DEPARTMENT">
                        <span className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-orange-500" /> Department — limited to one department
                        </span>
                      </SelectItem>
                      <SelectItem value="PROJECT">
                        <span className="flex items-center gap-2">
                          <FolderOpen className="h-3 w-3 text-purple-500" /> Project — limited to one project
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {scopeType === 'DEPARTMENT' && (
                  <div className="space-y-1.5">
                    <Label>Department Name</Label>
                    <Input
                      placeholder="e.g. Layup, CNC, Final QC"
                      value={scopeDepartment}
                      onChange={e => setScopeDepartment(e.target.value)}
                    />
                  </div>
                )}

                {scopeType === 'PROJECT' && (
                  <div className="space-y-1.5">
                    <Label>Project ID (UUID)</Label>
                    <Input
                      placeholder="e.g. 550e8400-e29b-41d4-a716-…"
                      value={scopeProjectId}
                      onChange={e => setScopeProjectId(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!isScopedGrantFormValid() || addScopedGrant.isPending}
                  onClick={() => addScopedGrant.mutate()}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Scoped Grant
                </Button>
              </CardContent>
            </Card>

            {/* Existing scoped grants */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Scoped Grants</CardTitle>
                <CardDescription>
                  These grants restrict capability authority to the specified scope. Requests outside the scope are denied.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(scopedGrants as ScopedGrant[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No scoped grants configured yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(scopedGrants as ScopedGrant[]).map(grant => (
                      <div
                        key={grant.id}
                        className="flex items-center justify-between px-3 py-2 border rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {grant.username}
                              {grant.firstName ? ` (${grant.firstName} ${grant.lastName})` : ''}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground">{grant.capabilityKey}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            {SCOPE_TYPE_ICONS[grant.scopeType]}
                            {SCOPE_TYPE_LABELS[grant.scopeType]}
                            {grant.scopeType === 'DEPARTMENT' && grant.department && (
                              <span className="ml-1 text-muted-foreground">— {grant.department}</span>
                            )}
                            {grant.scopeType === 'PROJECT' && grant.projectId && (
                              <span className="ml-1 text-muted-foreground font-mono">
                                — {grant.projectId.slice(0, 8)}…
                              </span>
                            )}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeScopedGrant.mutate(grant.id)}
                            disabled={removeScopedGrant.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
import { Shield, Plus, Trash2, User, ChevronDown, ChevronRight, Lock, Unlock } from 'lucide-react';

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

interface UserOption {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
}

function groupByCategory(caps: Capability[]) {
  const groups: Record<string, Capability[]> = {};
  for (const c of caps) {
    if (!groups[c.category]) groups[c.category] = [];
    groups[c.category].push(c);
  }
  return groups;
}

export default function RolesPermissionsPage() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideCapKey, setOverrideCapKey] = useState('');
  const [overrideEffect, setOverrideEffect] = useState<'allow' | 'deny'>('allow');

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({ queryKey: ['/api/permissions/roles'] });
  const { data: caps = [] } = useQuery<Capability[]>({ queryKey: ['/api/permissions/capabilities'] });
  const { data: overrides = [] } = useQuery<UserOverride[]>({ queryKey: ['/api/permissions/all-user-overrides'] });
  const { data: users = [] } = useQuery<UserOption[]>({ queryKey: ['/api/users'] });

  const capGroups = groupByCategory(caps);

  const addRole = useMutation({
    mutationFn: () => apiRequest('POST', '/api/permissions/roles', { name: newRoleName, description: newRoleDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/roles'] });
      setNewRoleName('');
      setNewRoleDesc('');
      toast({ title: 'Role created' });
    },
    onError: () => toast({ title: 'Failed to create role', variant: 'destructive' }),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: number) => apiRequest('DELETE', `/api/permissions/roles/${roleId}`),
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
        return apiRequest('DELETE', `/api/permissions/roles/${roleId}/capabilities/${capId}`);
      } else {
        return apiRequest('POST', `/api/permissions/roles/${roleId}/capabilities`, { capabilityId: capId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/roles'] });
    },
  });

  const addOverride = useMutation({
    mutationFn: () => apiRequest('POST', '/api/permissions/user-overrides', {
      userId: parseInt(overrideUserId),
      capabilityKey: overrideCapKey,
      effect: overrideEffect,
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
    mutationFn: (id: number) => apiRequest('DELETE', `/api/permissions/user-overrides/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/permissions/all-user-overrides'] }),
  });

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Refresh selectedRole from current roles data when roles refresh
  const liveSelectedRole = selectedRole ? roles.find(r => r.id === selectedRole.id) ?? selectedRole : null;

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
                      {(users as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}{u.firstName ? ` — ${u.firstName} ${u.lastName}` : ''}
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
      </Tabs>
    </div>
  );
}

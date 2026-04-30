import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Trash2,
  Edit,
  Plus,
  Users,
  Key,
  UserCheck,
  UserX,
  Shield,
  Monitor,
  Smartphone,
  Globe,
  LogOut,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// User interface matching the database schema
interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  passwordHash?: string;
  role: string;
  employeeId?: number;
  canOverridePrices: boolean;
  isActive: boolean;
  isFinishTechnician?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  failedLoginAttempts: number;
  accountLockedUntil?: string;
  passwordChangedAt: string;
  lockedUntil?: string;
}

interface InsertUser {
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  employeeId?: number;
  canOverridePrices?: boolean;
  isActive?: boolean;
  isFinishTechnician?: boolean;
}

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showUserModal, setShowUserModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sessionsUser, setSessionsUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<InsertUser>({
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'EMPLOYEE',
    canOverridePrices: false,
    isActive: true,
    isFinishTechnician: false,
  });

  // Fetch users
  const {
    data: allUsers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['/api/users'],
    queryFn: () => apiRequest('/api/users'),
  });

  // Fetch employees for the dropdown
  const { data: employees = [] } = useQuery<{ id: number; name: string; employeeCode: string }[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch roles from the role matrix
  const {
    data: permRoles = [],
    isLoading: rolesLoading,
    isError: rolesError,
  } = useQuery<{ id: number; name: string; description: string; isSystem: boolean }[]>({
    queryKey: ['/api/permissions/roles'],
  });

  const roleOptions = permRoles.length > 0
    ? permRoles.map(r => ({ value: r.name, label: r.name }))
    : [
        { value: 'EMPLOYEE', label: 'EMPLOYEE' },
        { value: 'OWNER', label: 'OWNER' },
        { value: 'ADMIN', label: 'ADMIN' },
      ];

  // Filter to show only active users (with safety check for array)
  const users = Array.isArray(allUsers)
    ? allUsers.filter((user: User) => user.isActive)
    : [];

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: InsertUser) =>
      apiRequest('/api/users', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      toast({
        title: 'User Created',
        description: 'New user has been successfully created.',
      });
      refetch();
      resetForm();
      setShowUserModal(false);
    },
    onError: (error: any) => {
      const errorMessage =
        error.details || error.message || 'Failed to create user.';
      toast({
        title: 'User Creation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertUser> }) =>
      apiRequest(`/api/users/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      toast({
        title: 'User Updated',
        description: 'User has been successfully updated.',
      });
      refetch();
      resetForm();
      setShowUserModal(false);
    },
    onError: (error: any) => {
      const errorMessage =
        error.details || error.message || 'Failed to update user.';
      toast({
        title: 'User Update Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/users/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'User Deactivated',
        description:
          'User has been deactivated and removed from the active user list.',
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user.',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      role: 'EMPLOYEE',
      canOverridePrices: false,
      isActive: true,
      isFinishTechnician: false,
    });
    setEditingUser(null);
  };

  const handleAddUser = () => {
    resetForm();
    setShowUserModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      password: '', // Don't pre-fill password for security
      role: user.role,
      employeeId: user.employeeId,
      canOverridePrices: user.canOverridePrices,
      isActive: user.isActive,
      isFinishTechnician: user.isFinishTechnician || false,
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = (
    id: number,
    firstName: string,
    lastName: string
  ) => {
    if (
      confirm(
        `Are you sure you want to deactivate user "${firstName} ${lastName}"? This will remove them from the active user list but preserve their data for audit purposes.`
      )
    ) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Different validation for create vs edit
    if (editingUser) {
      // When editing: only require first name and last name
      if (!formData.firstName || !formData.lastName) {
        toast({
          title: 'Missing Information',
          description: 'Please provide first name and last name.',
          variant: 'destructive',
        });
        return;
      }

      // For updates, don't include password if not provided
      const updateData = { ...formData };
      if (!updateData.password) {
        const { password, ...dataWithoutPassword } = updateData;
        updateUserMutation.mutate({
          id: editingUser.id,
          data: dataWithoutPassword,
        });
        return;
      }
      updateUserMutation.mutate({
        id: editingUser.id,
        data: updateData,
      });
    } else {
      // When creating: require all fields
      if (
        !formData.username ||
        !formData.firstName ||
        !formData.lastName ||
        !formData.password
      ) {
        toast({
          title: 'Missing Information',
          description:
            'Please provide username, first name, last name, and password.',
          variant: 'destructive',
        });
        return;
      }
      createUserMutation.mutate(formData);
    }
  };

  // User Capabilities Manager Component
  interface UserCapabilitiesManagerProps {
    userId: number;
    userName: string;
  }

  function UserCapabilitiesManager({
    userId,
    userName,
  }: UserCapabilitiesManagerProps) {
    // Fetch user capabilities
    const {
      data: userCapabilities = [],
      isLoading: loadingUserCaps,
      refetch: refetchUserCaps,
    } = useQuery<any[]>({
      queryKey: [`/api/users/${userId}/capabilities`],
      enabled: !!userId,
    });

    // Fetch all available capabilities
    const { data: allCapabilities = [], isLoading: loadingAllCaps } = useQuery<
      any[]
    >({
      queryKey: ['/api/employees/capabilities'],
    });

    // Grant capability mutation
    const grantMutation = useMutation({
      mutationFn: (capabilityId: number) =>
        apiRequest(`/api/users/${userId}/capabilities`, {
          method: 'POST',
          body: { capabilityId, useHardcoded: true },
        }),
      onSuccess: () => {
        toast({
          title: 'Capability Granted',
          description: 'Capability has been successfully granted.',
        });
        refetchUserCaps();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to grant capability.',
          variant: 'destructive',
        });
      },
    });

    // Revoke capability mutation
    const revokeMutation = useMutation({
      mutationFn: (userCapId: number) =>
        apiRequest(`/api/users/user-capabilities/${userCapId}`, {
          method: 'DELETE',
        }),
      onSuccess: () => {
        toast({
          title: 'Capability Revoked',
          description: 'Capability has been successfully revoked.',
        });
        refetchUserCaps();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to revoke capability.',
          variant: 'destructive',
        });
      },
    });

    const grantedCapabilityIds = userCapabilities.map(
      (uc: any) => uc.capabilityId
    );
    const availableToGrant = allCapabilities.filter(
      (cap: any) => !grantedCapabilityIds.includes(cap.id)
    );

    if (loadingUserCaps || loadingAllCaps) {
      return <div className="text-center py-4">Loading capabilities...</div>;
    }

    return (
      <div className="py-4 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            Managing capabilities for: <strong>{userName}</strong>
          </p>
        </div>

        {/* Granted Capabilities */}
        <div>
          <h3 className="font-semibold text-sm mb-3">
            Granted Capabilities ({userCapabilities.length})
          </h3>
          {userCapabilities.length === 0 ? (
            <p className="text-sm text-gray-500">
              No capabilities granted yet.
            </p>
          ) : (
            <div className="space-y-2">
              {userCapabilities.map((uc: any) => {
                const capability = allCapabilities.find(
                  (c: any) => c.id === uc.capabilityId
                );
                return (
                  <div
                    key={uc.id}
                    className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {capability?.displayName || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-600">
                        {capability?.description}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeMutation.mutate(uc.id)}
                      disabled={revokeMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Available to Grant */}
        <div>
          <h3 className="font-semibold text-sm mb-3">
            Available Capabilities ({availableToGrant.length})
          </h3>
          {availableToGrant.length === 0 ? (
            <p className="text-sm text-gray-500">
              All capabilities have been granted.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableToGrant.map((cap: any) => (
                <div
                  key={cap.id}
                  className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded"
                >
                  <div>
                    <p className="text-sm font-medium">{cap.displayName}</p>
                    <p className="text-xs text-gray-600">{cap.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Category: {cap.category}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => grantMutation.mutate(cap.id)}
                    disabled={grantMutation.isPending}
                  >
                    Grant
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  interface AdminSessionInfo {
    id: number;
    userId: number;
    username: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
    lastCredentialVerifiedAt: string | null;
  }

  interface AdminSessionsManagerProps {
    userId: number;
    userName: string;
  }

  function AdminSessionsManager({ userId, userName }: AdminSessionsManagerProps) {
    const { data: sessions = [], isLoading, refetch } = useQuery<AdminSessionInfo[]>({
      queryKey: ['/api/auth/admin/sessions', userId],
      queryFn: () => apiRequest(`/api/auth/admin/sessions?userId=${userId}`),
    });

    const terminateMutation = useMutation({
      mutationFn: (sessionId: number) =>
        apiRequest(`/api/auth/admin/sessions/${sessionId}`, { method: 'DELETE' }),
      onSuccess: () => {
        toast({ title: 'Session Terminated', description: 'The user session has been forcibly ended.' });
        refetch();
        queryClient.invalidateQueries({ queryKey: ['/api/auth/admin/sessions', userId] });
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to terminate session.', variant: 'destructive' });
      },
    });

    function getDeviceName(ua: string | null) {
      if (!ua) return 'Unknown Device';
      const l = ua.toLowerCase();
      if (l.includes('mobile') || l.includes('android') || l.includes('iphone')) return 'Mobile Device';
      if (l.includes('windows')) return 'Windows PC';
      if (l.includes('mac')) return 'Mac';
      return 'Desktop Browser';
    }

    if (isLoading) return <div className="text-center py-4">Loading sessions...</div>;

    return (
      <div className="py-4 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            Active sessions for: <strong>{userName}</strong>
          </p>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No active sessions for this user.</p>
        ) : (
          sessions.map((s: AdminSessionInfo) => {
            const DeviceIcon = (s.userAgent?.toLowerCase().includes('mobile')) ? Smartphone : Monitor;
            return (
              <div key={s.id} className="flex items-start justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg gap-3">
                <div className="flex items-start gap-2">
                  <DeviceIcon className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium">{getDeviceName(s.userAgent)}</div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {s.ipAddress && <div>IP: {s.ipAddress}</div>}
                      <div>Signed in: {new Date(s.createdAt).toLocaleString()}</div>
                      <div>Expires: {new Date(s.expiresAt).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => terminateMutation.mutate(s.id)}
                  disabled={terminateMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50 shrink-0"
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Terminate
                </Button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800';
      case 'OWNER':
        return 'bg-blue-100 text-blue-800';
      case 'EMPLOYEE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">User Management</h1>
        </div>
        <Button onClick={handleAddUser} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New User
        </Button>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Users Found
            </h3>
            <p className="text-gray-500 mb-4">
              Get started by creating your first user account.
            </p>
            <Button onClick={handleAddUser}>
              <Plus className="h-4 w-4 mr-2" />
              Add First User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user: User) => (
            <Card
              key={user.id}
              className={`${!user.isActive ? 'opacity-75' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {user.isActive ? (
                      <UserCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <UserX className="h-5 w-5 text-red-500" />
                    )}
                    {user.firstName} {user.lastName}
                  </CardTitle>
                  <Badge className={getRoleColor(user.role)}>{user.role}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">
                  <div className="text-xs text-gray-500 mb-2">
                    Username:{' '}
                    <span className="font-medium text-gray-700">
                      {user.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="h-4 w-4" />
                    <span
                      className={`font-medium ${user.canOverridePrices ? 'text-orange-600' : 'text-gray-500'}`}
                    >
                      {user.canOverridePrices
                        ? 'Can Override Prices'
                        : 'Standard Access'}
                    </span>
                  </div>

                  {user.employeeId && (
                    <div className="text-xs text-gray-500 mb-2">
                      Employee ID: {user.employeeId}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 space-y-1">
                    <div>Created: {formatDate(user.createdAt)}</div>
                    <div>Last Login: {formatDate(user.lastLoginAt)}</div>
                    {user.failedLoginAttempts > 0 && (
                      <div className="text-red-600">
                        Failed Attempts: {user.failedLoginAttempts}
                      </div>
                    )}
                    {user.accountLockedUntil &&
                      new Date(user.accountLockedUntil) > new Date() && (
                        <div className="text-red-600 font-medium">
                          Account Locked Until:{' '}
                          {formatDate(user.accountLockedUntil)}
                        </div>
                      )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditUser(user)}
                    className="flex items-center gap-1"
                  >
                    <Edit className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(user);
                      setShowPermissionsModal(true);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Shield className="h-3 w-3" />
                    Permissions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSessionsUser(user);
                      setShowSessionsModal(true);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Monitor className="h-3 w-3" />
                    Sessions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleDeleteUser(user.id, user.firstName, user.lastName)
                    }
                    className="flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Form Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  required={!editingUser}
                  disabled={!!editingUser}
                  placeholder="Enter username"
                  data-testid="input-username"
                  className={
                    editingUser ? 'bg-gray-100 cursor-not-allowed' : ''
                  }
                />
                {editingUser && (
                  <p className="text-xs text-gray-500 mt-1">
                    Username cannot be changed
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                  placeholder="Enter first name"
                  data-testid="input-firstname"
                />
              </div>

              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                  placeholder="Enter last name"
                  data-testid="input-lastname"
                />
              </div>

              <div>
                <Label htmlFor="password">
                  Password * {editingUser && '(leave blank to keep current)'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required={!editingUser}
                  placeholder="Enter password (min 4 characters)"
                  minLength={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Password must be at least 4 characters long
                </p>
              </div>

              <div>
                <Label htmlFor="role">Role</Label>
                {rolesError && (
                  <p className="text-xs text-destructive mb-1">
                    Could not load custom roles — showing system roles only.
                  </p>
                )}
                <Select
                  value={formData.role || 'EMPLOYEE'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, role: value })
                  }
                  disabled={rolesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={rolesLoading ? 'Loading roles…' : 'Select role'} />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="employeeId">Link to Employee (Optional)</Label>
                <Select
                  value={formData.employeeId?.toString() || 'none'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      employeeId: value === 'none' ? undefined : parseInt(value),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No employee link --</SelectItem>
                    {Array.isArray(employees) && employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canOverridePrices"
                  checked={formData.canOverridePrices || false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      canOverridePrices: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <Label htmlFor="canOverridePrices">Can Override Prices</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive !== false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isActive: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <Label htmlFor="isActive">Active User</Label>
              </div>

              {formData.employeeId && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isFinishTechnician"
                    data-testid="checkbox-finish-technician"
                    checked={formData.isFinishTechnician || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isFinishTechnician: e.target.checked,
                      })
                    }
                    className="rounded"
                  />
                  <Label htmlFor="isFinishTechnician">Finish Technician</Label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUserModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createUserMutation.isPending || updateUserMutation.isPending
                }
              >
                {createUserMutation.isPending || updateUserMutation.isPending
                  ? 'Saving...'
                  : editingUser
                    ? 'Update User'
                    : 'Create User'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Management Dialog */}
      <Dialog
        open={showPermissionsModal}
        onOpenChange={setShowPermissionsModal}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage Permissions - {selectedUser?.firstName}{' '}
              {selectedUser?.lastName}
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <UserCapabilitiesManager
              userId={selectedUser.id}
              userName={`${selectedUser.firstName} ${selectedUser.lastName}`}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Sessions Management Dialog */}
      <Dialog open={showSessionsModal} onOpenChange={setShowSessionsModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Active Sessions - {sessionsUser?.firstName} {sessionsUser?.lastName}
            </DialogTitle>
          </DialogHeader>

          {sessionsUser && (
            <AdminSessionsManager
              userId={sessionsUser.id}
              userName={`${sessionsUser.firstName} ${sessionsUser.lastName}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, Users, Key, UserCheck, UserX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// User interface matching the database schema
interface User {
  id: number;
  username: string;
  password: string;
  passwordHash?: string;
  role: string;
  employeeId?: number;
  canOverridePrices: boolean;
  isActive: boolean;
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
  password: string;
  role?: string;
  employeeId?: number;
  canOverridePrices?: boolean;
  isActive?: boolean;
}

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<InsertUser>({
    username: '',
    password: '',
    role: 'EMPLOYEE',
    canOverridePrices: false,
    isActive: true
  });

  // Fetch users
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/users'],
    queryFn: () => apiRequest('/api/users'),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: InsertUser) => apiRequest('/api/users', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      toast({
        title: "User Created",
        description: "New user has been successfully created.",
      });
      refetch();
      resetForm();
      setShowUserModal(false);
    },
    onError: (error: any) => {
      const errorMessage = error.details || error.message || "Failed to create user.";
      toast({
        title: "User Creation Failed",
        description: errorMessage,
        variant: "destructive",
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
        title: "User Updated",
        description: "User has been successfully updated.",
      });
      refetch();
      resetForm();
      setShowUserModal(false);
    },
    onError: (error: any) => {
      const errorMessage = error.details || error.message || "Failed to update user.";
      toast({
        title: "User Update Failed", 
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/users/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      toast({
        title: "User Deleted",
        description: "User has been successfully deleted.",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'EMPLOYEE',
      canOverridePrices: false,
      isActive: true
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
      password: '', // Don't pre-fill password for security
      role: user.role,
      employeeId: user.employeeId,
      canOverridePrices: user.canOverridePrices,
      isActive: user.isActive
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = (id: number, username: string) => {
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast({
        title: "Missing Information",
        description: "Please provide both username and password.",
        variant: "destructive",
      });
      return;
    }

    if (editingUser) {
      // For updates, don't require password if not provided
      const updateData = { ...formData };
      if (!updateData.password) {
        delete updateData.password; // Don't update password if not provided
      }
      updateUserMutation.mutate({
        id: editingUser.id,
        data: updateData,
      });
    } else {
      createUserMutation.mutate(formData);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800';
      case 'MANAGER': return 'bg-blue-100 text-blue-800';
      case 'EMPLOYEE': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Users Found</h3>
            <p className="text-gray-500 mb-4">Get started by creating your first user account.</p>
            <Button onClick={handleAddUser}>
              <Plus className="h-4 w-4 mr-2" />
              Add First User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user: User) => (
            <Card key={user.id} className={`${!user.isActive ? 'opacity-75' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {user.isActive ? (
                      <UserCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <UserX className="h-5 w-5 text-red-500" />
                    )}
                    {user.username}
                  </CardTitle>
                  <Badge className={getRoleColor(user.role)}>
                    {user.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="h-4 w-4" />
                    <span className={`font-medium ${user.canOverridePrices ? 'text-orange-600' : 'text-gray-500'}`}>
                      {user.canOverridePrices ? 'Can Override Prices' : 'Standard Access'}
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
                    {user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date() && (
                      <div className="text-red-600 font-medium">
                        Account Locked Until: {formatDate(user.accountLockedUntil)}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditUser(user)}
                    className="flex items-center gap-1 flex-1"
                  >
                    <Edit className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteUser(user.id, user.username)}
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
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  placeholder="Enter username"
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
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder="Enter password (min 6 characters)"
                  minLength={6}
                />
                <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters long</p>
              </div>
              
              <div>
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={formData.role || 'EMPLOYEE'} 
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="employeeId">Employee ID (Optional)</Label>
                <Input
                  id="employeeId"
                  type="number"
                  value={formData.employeeId || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    employeeId: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  placeholder="Link to employee record"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="canOverridePrices"
                  checked={formData.canOverridePrices || false}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    canOverridePrices: e.target.checked 
                  })}
                  className="rounded"
                />
                <Label htmlFor="canOverridePrices">Can Override Prices</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive !== false}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    isActive: e.target.checked 
                  })}
                  className="rounded"
                />
                <Label htmlFor="isActive">Active User</Label>
              </div>
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
                disabled={createUserMutation.isPending || updateUserMutation.isPending}
              >
                {createUserMutation.isPending || updateUserMutation.isPending 
                  ? 'Saving...' 
                  : editingUser 
                    ? 'Update User' 
                    : 'Create User'
                }
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
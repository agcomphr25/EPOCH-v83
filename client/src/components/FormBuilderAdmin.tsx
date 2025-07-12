import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, Save, X } from 'lucide-react';

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'autocomplete' | 'textarea' | 'checkbox';
  required: boolean;
  roles: string[];
  options?: string[];
}

interface Form {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'number', label: 'Number Input' },
  { value: 'date', label: 'Date Input' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'autocomplete', label: 'Autocomplete' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'checkbox', label: 'Checkbox' }
];

const USER_ROLES = ['Admin', 'CSR', 'Production', 'Owner'];

export default function FormBuilderAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [newForm, setNewForm] = useState({ name: '', description: '' });
  const [newField, setNewField] = useState<Partial<FormField>>({
    key: '',
    label: '',
    type: 'text',
    required: false,
    roles: ['Admin'],
    options: []
  });

  // Fetch forms
  const { data: forms, isLoading } = useQuery({
    queryKey: ['/api/forms'],
    queryFn: () => apiRequest('/api/forms')
  });

  // Create form mutation
  const createFormMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => 
      apiRequest('/api/forms', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      setShowAddForm(false);
      setNewForm({ name: '', description: '' });
      toast({ title: 'Success', description: 'Form created successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create form', variant: 'destructive' });
    }
  });

  // Update form mutation
  const updateFormMutation = useMutation({
    mutationFn: (data: { id: string; form: Partial<Form> }) => 
      apiRequest(`/api/forms/${data.id}`, { method: 'PUT', body: data.form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      setEditingForm(null);
      toast({ title: 'Success', description: 'Form updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update form', variant: 'destructive' });
    }
  });

  // Delete form mutation
  const deleteFormMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      toast({ title: 'Success', description: 'Form deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete form', variant: 'destructive' });
    }
  });

  const handleCreateForm = () => {
    if (!newForm.name.trim()) {
      toast({ title: 'Error', description: 'Form name is required', variant: 'destructive' });
      return;
    }
    createFormMutation.mutate(newForm);
  };

  const handleEditForm = (form: Form) => {
    setEditingForm({ ...form });
  };

  const handleDeleteForm = (id: string) => {
    if (confirm('Are you sure you want to delete this form?')) {
      deleteFormMutation.mutate(id);
    }
  };

  const handleSaveForm = () => {
    if (!editingForm) return;
    updateFormMutation.mutate({ id: editingForm.id, form: editingForm });
  };

  const handleAddField = () => {
    if (!editingForm || !newField.key || !newField.label) {
      toast({ title: 'Error', description: 'Field key and label are required', variant: 'destructive' });
      return;
    }

    const updatedForm = {
      ...editingForm,
      fields: [...editingForm.fields, newField as FormField]
    };
    
    setEditingForm(updatedForm);
    setNewField({
      key: '',
      label: '',
      type: 'text',
      required: false,
      roles: ['Admin'],
      options: []
    });
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (!editingForm) return;
    
    const fields = [...editingForm.fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < fields.length) {
      [fields[index], fields[newIndex]] = [fields[newIndex], fields[index]];
      setEditingForm({ ...editingForm, fields });
    }
  };

  const handleDeleteField = (index: number) => {
    if (!editingForm) return;
    
    const fields = editingForm.fields.filter((_, i) => i !== index);
    setEditingForm({ ...editingForm, fields });
  };

  const handleFieldRoleChange = (fieldIndex: number, role: string, checked: boolean) => {
    if (!editingForm) return;
    
    const fields = [...editingForm.fields];
    const field = fields[fieldIndex];
    
    if (checked) {
      field.roles = [...field.roles, role];
    } else {
      field.roles = field.roles.filter(r => r !== role);
    }
    
    setEditingForm({ ...editingForm, fields });
  };

  if (isLoading) {
    return <div className="p-6">Loading forms...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Forms List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Forms</CardTitle>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Form
          </Button>
        </CardHeader>
        <CardContent>
          {showAddForm && (
            <div className="p-4 border rounded-lg mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Form Name</Label>
                  <Input
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="Enter form name"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    placeholder="Enter form description"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateForm} disabled={createFormMutation.isPending}>
                  {createFormMutation.isPending ? 'Creating...' : 'Create Form'}
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 p-3 text-left">Name</th>
                  <th className="border border-gray-300 p-3 text-left">Description</th>
                  <th className="border border-gray-300 p-3 text-left">Fields</th>
                  <th className="border border-gray-300 p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms?.map((form: Form) => (
                  <tr key={form.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-3 font-medium">{form.name}</td>
                    <td className="border border-gray-300 p-3">{form.description || 'No description'}</td>
                    <td className="border border-gray-300 p-3">
                      <Badge variant="secondary">{form.fields?.length || 0} fields</Badge>
                    </td>
                    <td className="border border-gray-300 p-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditForm(form)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteForm(form.id)}
                          disabled={deleteFormMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      {editingForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Edit Form: {editingForm.name}</CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleSaveForm} disabled={updateFormMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateFormMutation.isPending ? 'Saving...' : 'Save Form'}
              </Button>
              <Button variant="outline" onClick={() => setEditingForm(null)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Form Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Form Name</Label>
                <Input
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editingForm.description || ''}
                  onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })}
                />
              </div>
            </div>

            {/* Fields List */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Form Fields</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Label</th>
                      <th className="border border-gray-300 p-3 text-left">Key</th>
                      <th className="border border-gray-300 p-3 text-left">Type</th>
                      <th className="border border-gray-300 p-3 text-left">Required</th>
                      <th className="border border-gray-300 p-3 text-left">Roles</th>
                      <th className="border border-gray-300 p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingForm.fields?.map((field, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-3">{field.label}</td>
                        <td className="border border-gray-300 p-3 font-mono text-sm">{field.key}</td>
                        <td className="border border-gray-300 p-3">{field.type}</td>
                        <td className="border border-gray-300 p-3">
                          {field.required ? 'Yes' : 'No'}
                        </td>
                        <td className="border border-gray-300 p-3">
                          <div className="flex gap-1 flex-wrap">
                            {field.roles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="border border-gray-300 p-3">
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMoveField(index, 'up')}
                              disabled={index === 0}
                            >
                              <ArrowUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMoveField(index, 'down')}
                              disabled={index === editingForm.fields.length - 1}
                            >
                              <ArrowDown className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteField(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Field */}
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-semibold mb-4">Add New Field</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>Field Label</Label>
                  <Input
                    value={newField.label || ''}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    placeholder="Enter field label"
                  />
                </div>
                <div>
                  <Label>Field Key</Label>
                  <Input
                    value={newField.key || ''}
                    onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                    placeholder="Enter field key (e.g., firstName)"
                  />
                </div>
                <div>
                  <Label>Field Type</Label>
                  <Select 
                    value={newField.type} 
                    onValueChange={(value) => setNewField({ ...newField, type: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="required"
                    checked={newField.required}
                    onCheckedChange={(checked) => setNewField({ ...newField, required: checked as boolean })}
                  />
                  <Label htmlFor="required">Required</Label>
                </div>
              </div>

              {/* Roles */}
              <div className="mb-4">
                <Label className="mb-2 block">Visible to Roles</Label>
                <div className="flex gap-4">
                  {USER_ROLES.map((role) => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={newField.roles?.includes(role)}
                        onCheckedChange={(checked) => {
                          const roles = newField.roles || [];
                          if (checked) {
                            setNewField({ ...newField, roles: [...roles, role] });
                          } else {
                            setNewField({ ...newField, roles: roles.filter(r => r !== role) });
                          }
                        }}
                      />
                      <Label htmlFor={`role-${role}`}>{role}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Options for dropdown */}
              {newField.type === 'dropdown' && (
                <div className="mb-4">
                  <Label>Options (comma-separated)</Label>
                  <Textarea
                    value={newField.options?.join(', ') || ''}
                    onChange={(e) => setNewField({ 
                      ...newField, 
                      options: e.target.value.split(',').map(opt => opt.trim()).filter(opt => opt) 
                    })}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              )}

              <Button onClick={handleAddField}>
                <Plus className="w-4 h-4 mr-2" />
                Add Field
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
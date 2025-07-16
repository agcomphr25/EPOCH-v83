import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus, ChevronUp, ChevronDown, Edit, Save, X } from 'lucide-react';

const ROLE_OPTIONS = ['Admin', 'CSR', 'Production', 'Owner'];
const FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'autocomplete', 'textarea', 'checkbox'];

interface FormField {
  id?: string;
  label: string;
  key: string;
  type: string;
  required: boolean;
  roles: string[];
  optionsText?: string;
  options?: string[];
}

interface FormData {
  id?: number;
  name: string;
  description: string;
  fields: FormField[];
}

export default function FormBuilderAdmin() {
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', description: '' });
  const [editingFormId, setEditingFormId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<FormField[]>([]);
  
  const queryClient = useQueryClient();

  // Fetch forms
  const { data: forms = [], isLoading } = useQuery<FormData[]>({
    queryKey: ['/api/forms'],
  });

  // Mutations
  const createFormMutation = useMutation({
    mutationFn: (data: { name: string; description: string; fields: FormField[] }) => 
      apiRequest('/api/forms', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      setAdding(false);
      setNewForm({ name: '', description: '' });
      toast.success('Form created');
    },
    onError: () => toast.error('Create failed'),
  });

  const updateFormMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { fields: FormField[] } }) => 
      apiRequest(`/api/forms/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      setEditingFormId(null);
      toast.success('Form saved');
    },
    onError: () => toast.error('Save failed'),
  });

  const deleteFormMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  // Form handlers
  const saveNewForm = () => {
    if (!newForm.name) return toast.error('Name required');
    createFormMutation.mutate({
      name: newForm.name,
      description: newForm.description,
      fields: []
    });
  };

  const deleteForm = (id: number) => {
    if (!window.confirm('Delete this form?')) return;
    deleteFormMutation.mutate(id);
  };

  const startEdit = (form: FormData) => {
    setEditingFormId(form.id!);
    setEditFields(form.fields.map(f => ({ 
      ...f, 
      optionsText: f.options?.join(', ') || '' 
    })));
  };

  // Field actions
  const addField = () => {
    setEditFields([...editFields, {
      id: `new-${Date.now()}`,
      label: '',
      key: '',
      type: 'text',
      required: false,
      roles: [],
      optionsText: ''
    }]);
  };

  const updateFieldAt = (idx: number, key: string, value: any) => {
    const updated = [...editFields];
    updated[idx] = { ...updated[idx], [key]: value };
    setEditFields(updated);
  };

  const removeFieldAt = (idx: number) => {
    setEditFields(editFields.filter((_, i) => i !== idx));
  };

  const moveField = (idx: number, direction: number) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= editFields.length) return;
    const arr = [...editFields];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setEditFields(arr);
  };

  const saveForm = () => {
    const payload = {
      fields: editFields.map(f => ({
        id: String(f.id).startsWith('new-') ? undefined : f.id,
        label: f.label,
        key: f.key,
        type: f.type,
        required: f.required,
        roles: f.roles,
        options: f.type === 'dropdown' && f.optionsText 
          ? f.optionsText.split(',').map(o => o.trim())
          : undefined
      }))
    };
    updateFormMutation.mutate({ id: editingFormId!, data: payload });
  };

  if (isLoading) return <div>Loading forms...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Form Builder Admin</h1>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-4 w-4 mr-2" />
          Add Form
        </Button>
      </div>

      {/* Forms List */}
      <div className="grid gap-4">
        {forms.map((form) => (
          <Card key={form.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{form.name}</CardTitle>
                  <p className="text-sm text-gray-600">{form.description}</p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(form)}
                    disabled={editingFormId === form.id}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteForm(form.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                {form.fields.length} field{form.fields.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Form Dialog */}
      {adding && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                placeholder="Form name"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                placeholder="Form description"
                value={newForm.description}
                onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={saveNewForm} disabled={createFormMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => setAdding(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Fields Section */}
      {editingFormId && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Form Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editFields.map((field, idx) => (
              <div key={field.id} className="border rounded p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Label</label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateFieldAt(idx, 'label', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Key</label>
                    <Input
                      value={field.key}
                      onChange={(e) => updateFieldAt(idx, 'key', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <Select
                      value={field.type}
                      onValueChange={(value) => updateFieldAt(idx, 'type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map(type => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Required</label>
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(checked) => updateFieldAt(idx, 'required', checked)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Roles</label>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_OPTIONS.map(role => (
                      <label key={role} className="flex items-center space-x-2">
                        <Checkbox
                          checked={field.roles.includes(role)}
                          onCheckedChange={(checked) => {
                            const newRoles = checked
                              ? [...field.roles, role]
                              : field.roles.filter(r => r !== role);
                            updateFieldAt(idx, 'roles', newRoles);
                          }}
                        />
                        <span className="text-sm">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {field.type === 'dropdown' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Options (comma-separated)</label>
                    <Textarea
                      value={field.optionsText || ''}
                      onChange={(e) => updateFieldAt(idx, 'optionsText', e.target.value)}
                      placeholder="Option 1, Option 2, Option 3"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveField(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveField(idx, 1)}
                      disabled={idx === editFields.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFieldAt(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button onClick={addField} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>

            <div className="flex space-x-2">
              <Button onClick={saveForm} disabled={updateFormMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Form
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingFormId(null)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
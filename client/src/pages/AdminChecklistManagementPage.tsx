import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ClipboardList,
  Plus,
  Trash2,
  Edit,
  Users,
  History,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';

interface TemplateItem {
  id?: number;
  templateId?: number;
  label: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  frequency: string;
  sortOrder: number;
}

interface Template {
  id: number;
  name: string;
  description: string | null;
  department: string | null;
  isActive: boolean;
  enforceClockOut: boolean;
  createdAt: string;
  itemCount?: number;
  assignmentCount?: number;
  items?: TemplateItem[];
  assignments?: any[];
}

interface Employee {
  id: number;
  name: string;
  department: string;
  employeeCode: string;
}

interface HistoryRecord {
  id: number;
  templateId: number;
  employeeId: number;
  periodDate: string;
  completedAt: string | null;
  templateName: string;
  employeeName: string;
  responseItems: Array<{
    id: number;
    templateItemId: number;
    value: string | null;
    completed: boolean;
    label: string;
    type: string;
    required: boolean;
    frequency: string;
  }> | null;
}

export default function AdminChecklistManagementPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState<number | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [historyFilters, setHistoryFilters] = useState({ employeeId: '', templateId: '', from: '', to: '' });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    department: '',
    isActive: true,
    enforceClockOut: true,
    items: [] as TemplateItem[],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ['/api/checklist-management/templates'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    select: (data: any) => {
      if (Array.isArray(data)) return data;
      if (data?.employees) return data.employees;
      return [];
    },
  });

  const { data: historyData = [], isLoading: historyLoading } = useQuery<HistoryRecord[]>({
    queryKey: ['/api/checklist-management/history', historyFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyFilters.employeeId) params.set('employeeId', historyFilters.employeeId);
      if (historyFilters.templateId) params.set('templateId', historyFilters.templateId);
      if (historyFilters.from) params.set('from', historyFilters.from);
      if (historyFilters.to) params.set('to', historyFilters.to);
      const res = await fetch(`/api/checklist-management/history?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: activeTab === 'history',
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/checklist-management/templates', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Template created successfully' });
      setTemplateDialogOpen(false);
      resetForm();
    },
    onError: () => toast({ title: 'Failed to create template', variant: 'destructive' }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest(`/api/checklist-management/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Template updated successfully' });
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      resetForm();
    },
    onError: () => toast({ title: 'Failed to update template', variant: 'destructive' }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/checklist-management/templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: () => toast({ title: 'Failed to delete template', variant: 'destructive' }),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ templateId, item }: { templateId: number; item: any }) => {
      return await apiRequest(`/api/checklist-management/templates/${templateId}/items`, { method: 'POST', body: JSON.stringify(item) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({ templateId, itemId }: { templateId: number; itemId: number }) => {
      await apiRequest(`/api/checklist-management/templates/${templateId}/items/${itemId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ templateId, employeeIds }: { templateId: number; employeeIds: number[] }) => {
      return await apiRequest('/api/checklist-management/assignments/bulk', { method: 'POST', body: JSON.stringify({ templateId, employeeIds }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Employees assigned successfully' });
      setAssignDialogOpen(false);
      setSelectedEmployees([]);
    },
    onError: () => toast({ title: 'Failed to assign employees', variant: 'destructive' }),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/checklist-management/assignments/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Assignment removed' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', description: '', department: '', isActive: true, enforceClockOut: true, items: [] });
  };

  const openCreateDialog = () => {
    setEditingTemplate(null);
    resetForm();
    setTemplateDialogOpen(true);
  };

  const openEditDialog = async (template: Template) => {
    try {
      const res = await fetch(`/api/checklist-management/templates/${template.id}`);
      const fullTemplate = await res.json();
      setEditingTemplate(fullTemplate);
      setFormData({
        name: fullTemplate.name,
        description: fullTemplate.description || '',
        department: fullTemplate.department || '',
        isActive: fullTemplate.is_active ?? fullTemplate.isActive ?? true,
        enforceClockOut: fullTemplate.enforce_clock_out ?? fullTemplate.enforceClockOut ?? true,
        items: (fullTemplate.items || []).map((item: any) => ({
          id: item.id,
          templateId: item.template_id,
          label: item.label,
          type: item.type,
          options: item.options,
          required: item.required,
          frequency: item.frequency || 'DAILY',
          sortOrder: item.sort_order ?? item.sortOrder ?? 0,
        })),
      });
      setTemplateDialogOpen(true);
    } catch {
      toast({ title: 'Failed to load template details', variant: 'destructive' });
    }
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Template name is required', variant: 'destructive' });
      return;
    }
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: formData });
    } else {
      createTemplateMutation.mutate(formData);
    }
  };

  const addNewItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { label: '', type: 'checkbox', required: false, frequency: 'DAILY', sortOrder: prev.items.length }],
    }));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const openAssignDialog = (templateId: number) => {
    setAssignTemplateId(templateId);
    setSelectedEmployees([]);
    setAssignDialogOpen(true);
  };

  const toggleEmployee = (employeeId: number) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleBulkAssign = () => {
    if (!assignTemplateId || selectedEmployees.length === 0) return;
    bulkAssignMutation.mutate({ templateId: assignTemplateId, employeeIds: selectedEmployees });
  };

  const frequencyLabel = (f: string) => {
    switch (f) {
      case 'DAILY': return 'Daily';
      case 'WEEKLY': return 'Weekly';
      case 'MONTHLY': return 'Monthly';
      default: return f;
    }
  };

  const frequencyColor = (f: string) => {
    switch (f) {
      case 'DAILY': return 'bg-blue-100 text-blue-800';
      case 'WEEKLY': return 'bg-purple-100 text-purple-800';
      case 'MONTHLY': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTemplateFrequencySummary = (template: Template) => {
    const count = parseInt(String(template.itemCount || 0));
    return `${count} item${count !== 1 ? 's' : ''}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Checklist Management
          </h1>
          <p className="text-muted-foreground">Create and manage checklists for employees across departments</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="templates" className="flex items-center gap-1">
            <ClipboardList className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Checklist Templates</h2>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>

          {templatesLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No checklist templates yet. Create your first template to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        {template.isActive || (template as any).is_active ? (
                          <Badge variant="outline" className="border-green-500 text-green-700">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-gray-400 text-gray-500">Inactive</Badge>
                        )}
                        {(template.enforceClockOut || (template as any).enforce_clock_out) && (
                          <Badge variant="outline" className="border-orange-500 text-orange-700">Clock-out enforced</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openAssignDialog(template.id)}>
                          <Users className="w-4 h-4 mr-1" />
                          Assign
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm('Delete this template? This will also remove all assignments and saved responses.')) {
                              deleteTemplateMutation.mutate(template.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-6 text-sm text-muted-foreground">
                      <span>{getTemplateFrequencySummary(template)}</span>
                      <span>{template.assignmentCount || (template as any).assignment_count || 0} employees assigned</span>
                      {template.department && <span>Dept: {template.department}</span>}
                      <span>Created {(template.createdAt || (template as any).created_at) ? format(new Date(template.createdAt || (template as any).created_at), 'MMM d, yyyy') : ''}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <h2 className="text-lg font-semibold">Employee Assignments</h2>
          <p className="text-sm text-muted-foreground">View which employees are assigned to which checklists. Use the "Assign" button on a template to add employees.</p>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Create a template first, then assign employees to it.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <AssignmentCard
                  key={template.id}
                  template={template}
                  onAssign={() => openAssignDialog(template.id)}
                  onDeleteAssignment={(id) => deleteAssignmentMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <h2 className="text-lg font-semibold">Completion History</h2>

          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Employee</Label>
                  <Select
                    value={historyFilters.employeeId}
                    onValueChange={(v) => setHistoryFilters(prev => ({ ...prev, employeeId: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All employees</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Template</Label>
                  <Select
                    value={historyFilters.templateId}
                    onValueChange={(v) => setHistoryFilters(prev => ({ ...prev, templateId: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="All templates" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All templates</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={historyFilters.from}
                    onChange={(e) => setHistoryFilters(prev => ({ ...prev, from: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={historyFilters.to}
                    onChange={(e) => setHistoryFilters(prev => ({ ...prev, to: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : historyData.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completion records found for the selected filters.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Period Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Completed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((record) => (
                    <>
                      <TableRow
                        key={record.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedHistory(expandedHistory === record.id ? null : record.id)}
                      >
                        <TableCell>
                          {expandedHistory === record.id ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{record.employeeName || (record as any).employee_name}</TableCell>
                        <TableCell>{record.templateName || (record as any).template_name}</TableCell>
                        <TableCell>{record.periodDate || (record as any).period_date}</TableCell>
                        <TableCell>
                          {(record.completedAt || (record as any).completed_at) ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800">
                              <XCircle className="w-3 h-3 mr-1" />
                              Partial
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {(record.completedAt || (record as any).completed_at) ? format(new Date(record.completedAt || (record as any).completed_at), 'MMM d, yyyy h:mm a') : '-'}
                        </TableCell>
                      </TableRow>
                      {expandedHistory === record.id && (record.responseItems || (record as any).response_items) && (
                        <TableRow key={`${record.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Response Details</h4>
                              <div className="grid gap-2">
                                {(record.responseItems || (record as any).response_items || []).map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                                    <div className="flex items-center gap-2">
                                      {item.required && <span className="text-red-500 text-xs">*</span>}
                                      <span className="text-sm">{item.label}</span>
                                      <Badge variant="outline" className="text-xs">{item.type}</Badge>
                                      <Badge className={`text-xs ${frequencyColor(item.frequency)}`}>
                                        {frequencyLabel(item.frequency)}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {item.type === 'checkbox' ? (
                                        item.completed ? (
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <XCircle className="w-4 h-4 text-gray-400" />
                                        )
                                      ) : (
                                        <span className="text-sm font-medium">{item.value || '-'}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Template Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Production Floor Tasks"
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of this checklist..."
                  rows={2}
                />
              </div>
              <div>
                <Label>Department (optional)</Label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="e.g., Production"
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))}
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.enforceClockOut}
                    onCheckedChange={(v) => setFormData(prev => ({ ...prev, enforceClockOut: v }))}
                  />
                  <Label>Enforce on clock-out</Label>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-base font-semibold">Checklist Items</Label>
                  <p className="text-xs text-muted-foreground mt-1">Each item has its own frequency (daily, weekly, or monthly)</p>
                </div>
                <Button size="sm" variant="outline" onClick={addNewItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {formData.items.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                  <p>No items yet. Add items to define what employees need to complete.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid grid-cols-12 gap-2">
                          <div className="col-span-4">
                            <Input
                              value={item.label}
                              onChange={(e) => updateItem(index, 'label', e.target.value)}
                              placeholder="Item label"
                            />
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={item.type}
                              onValueChange={(v) => updateItem(index, 'type', v)}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="checkbox">Checkbox</SelectItem>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="select">Dropdown</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={item.frequency}
                              onValueChange={(v) => updateItem(index, 'frequency', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DAILY">Daily</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {item.type === 'select' && (
                            <div className="col-span-2">
                              <Input
                                value={(item.options || []).join(', ')}
                                onChange={(e) => updateItem(index, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                placeholder="Options (comma separated)"
                              />
                            </div>
                          )}
                          <div className={`${item.type === 'select' ? 'col-span-2' : 'col-span-4'} flex items-center gap-2`}>
                            <Checkbox
                              checked={item.required}
                              onCheckedChange={(v) => updateItem(index, 'required', Boolean(v))}
                            />
                            <Label className="text-sm">Required</Label>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
            >
              {(createTemplateMutation.isPending || updateTemplateMutation.isPending) ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Employees</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select employees to assign to this checklist. Already-assigned employees will be kept.
            </p>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 p-2 border rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleEmployee(emp.id)}
                >
                  <Checkbox checked={selectedEmployees.includes(emp.id)} />
                  <div>
                    <span className="font-medium">{emp.name}</span>
                    {emp.department && (
                      <span className="text-sm text-muted-foreground ml-2">({emp.department})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium">{selectedEmployees.length} employee(s) selected</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBulkAssign}
              disabled={selectedEmployees.length === 0 || bulkAssignMutation.isPending}
            >
              {bulkAssignMutation.isPending ? 'Assigning...' : 'Assign Selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignmentCard({ template, onAssign, onDeleteAssignment }: {
  template: Template;
  onAssign: () => void;
  onDeleteAssignment: (id: number) => void;
}) {
  const { data: assignments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/checklist-management/templates', template.id, 'assignments'],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-management/templates/${template.id}/assignments`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{template.name}</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={onAssign}>
            <Plus className="w-4 h-4 mr-1" />
            Add Employees
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No employees assigned yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a: any) => (
              <Badge key={a.id} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                {a.employee_name || a.employeeName}
                {(a.employee_department || a.employeeDepartment) && (
                  <span className="text-xs opacity-70">({a.employee_department || a.employeeDepartment})</span>
                )}
                <button
                  className="ml-1 text-red-500 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAssignment(a.id);
                  }}
                >
                  <XCircle className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

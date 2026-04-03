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
  Activity,
  Eye,
  BookOpen,
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
  role?: string;
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

interface InstanceRecord {
  id: number;
  template_id: number;
  employee_id: number;
  context_date: string;
  status: string;
  completed_at: string | null;
  reviewed_at: string | null;
  template_name: string;
  employee_name: string;
  employee_department: string;
  total_items: number;
  completed_items: number;
}

interface InstanceEvent {
  id: number;
  instance_id: number;
  instance_item_id: number | null;
  event_type: string;
  actor_display_name: string | null;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  reviewed: 'bg-purple-100 text-purple-800',
};

export default function AdminChecklistManagementPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState<number | null>(null);
  const [assignmentType, setAssignmentType] = useState<'employee' | 'department' | 'role'>('employee');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [assignDepartment, setAssignDepartment] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [historyFilters, setHistoryFilters] = useState({ employeeId: '', templateId: '', from: '', to: '' });
  const [historyPage, setHistoryPage] = useState(0);
  const PAGE_SIZE = 50;

  const [instanceFilters, setInstanceFilters] = useState({ date: '', department: '', status: '' });
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [createInstanceDialogOpen, setCreateInstanceDialogOpen] = useState(false);
  const [createInstanceForm, setCreateInstanceForm] = useState({ templateId: '', employeeId: '', contextDate: new Date().toISOString().split('T')[0], contextType: 'daily' });

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

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  const roles = [...new Set(employees.map(e => e.role).filter(Boolean))].sort() as string[];

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/checklist-management/history', historyFilters, historyPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyFilters.employeeId) params.set('employeeId', historyFilters.employeeId);
      if (historyFilters.templateId) params.set('templateId', historyFilters.templateId);
      if (historyFilters.from) params.set('from', historyFilters.from);
      if (historyFilters.to) params.set('to', historyFilters.to);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(historyPage * PAGE_SIZE));
      const res = await fetch(`/api/checklist-management/history?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: activeTab === 'history',
  });

  const historyRecords: HistoryRecord[] = Array.isArray(historyData) ? historyData : [];

  const { data: activeInstances = [], isLoading: instancesLoading } = useQuery<InstanceRecord[]>({
    queryKey: ['/api/checklist-instances/active-all', instanceFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (instanceFilters.date) params.set('date', instanceFilters.date);
      if (instanceFilters.department) params.set('department', instanceFilters.department);
      if (instanceFilters.status) params.set('status', instanceFilters.status);
      const res = await fetch(`/api/checklist-instances/active-all?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: activeTab === 'instances' || activeTab === 'completed',
  });

  const { data: instanceEvents = [], isLoading: eventsLoading } = useQuery<InstanceEvent[]>({
    queryKey: ['/api/checklist-instances', selectedInstance, 'events'],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances/${selectedInstance}/events`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: selectedInstance !== null && activeTab === 'event-log',
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

  const assignByGroupMutation = useMutation({
    mutationFn: async ({ templateId, type, value }: { templateId: number; type: string; value: string }) => {
      return await apiRequest('/api/checklist-management/assignments', {
        method: 'POST',
        body: JSON.stringify({ templateId, assignmentType: type, departmentName: type === 'department' ? value : null, roleKey: type === 'role' ? value : null }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-management/templates'] });
      toast({ title: 'Assignment created successfully' });
      setAssignDialogOpen(false);
    },
    onError: () => toast({ title: 'Failed to create assignment', variant: 'destructive' }),
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

  const reviewInstanceMutation = useMutation({
    mutationFn: async (instanceId: number) => {
      return await apiRequest(`/api/checklist-instances/${instanceId}/review`, { method: 'POST', body: JSON.stringify({}) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-instances/active-all', instanceFilters] });
      toast({ title: 'Instance marked as reviewed' });
    },
    onError: () => toast({ title: 'Failed to review instance', variant: 'destructive' }),
  });

  const createInstanceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/checklist-instances', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-instances/active-all', instanceFilters] });
      toast({ title: 'Instance created successfully' });
    },
    onError: () => toast({ title: 'Failed to create instance', variant: 'destructive' }),
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
    setAssignmentType('employee');
    setAssignDepartment('');
    setAssignRole('');
    setAssignDialogOpen(true);
  };

  const toggleEmployee = (employeeId: number) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleBulkAssign = () => {
    if (!assignTemplateId) return;
    if (assignmentType === 'employee') {
      if (selectedEmployees.length === 0) return;
      bulkAssignMutation.mutate({ templateId: assignTemplateId, employeeIds: selectedEmployees });
    } else if (assignmentType === 'department') {
      if (!assignDepartment) return;
      assignByGroupMutation.mutate({ templateId: assignTemplateId, type: 'department', value: assignDepartment });
    } else if (assignmentType === 'role') {
      if (!assignRole) return;
      assignByGroupMutation.mutate({ templateId: assignTemplateId, type: 'role', value: assignRole });
    }
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

  const completedInstances = activeInstances.filter(i => i.status === 'completed' || i.status === 'reviewed');
  const pendingInstances = activeInstances.filter(i => i.status === 'pending' || i.status === 'in_progress');

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
        <TabsList className="flex flex-wrap gap-1 h-auto max-w-3xl">
          <TabsTrigger value="templates" className="flex items-center gap-1">
            <ClipboardList className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="instances" className="flex items-center gap-1">
            <Activity className="w-4 h-4" />
            Active Instances
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="event-log" className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            Event Log
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="w-4 h-4" />
            Legacy History
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
                      <span>{template.assignmentCount || (template as any).assignment_count || 0} assignments</span>
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
          <h2 className="text-lg font-semibold">Assignments</h2>
          <p className="text-sm text-muted-foreground">View which employees/departments are assigned to which checklists.</p>

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

        <TabsContent value="instances" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active Instances</h2>
            <Button size="sm" onClick={() => setCreateInstanceDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />Create Instance
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={instanceFilters.date}
                    onChange={(e) => setInstanceFilters(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Department</Label>
                  <Select
                    value={instanceFilters.department}
                    onValueChange={(v) => setInstanceFilters(prev => ({ ...prev, department: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={instanceFilters.status}
                    onValueChange={(v) => setInstanceFilters(prev => ({ ...prev, status: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {instancesLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : pendingInstances.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active instances found.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInstances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.employee_name}</TableCell>
                      <TableCell>{instance.employee_department}</TableCell>
                      <TableCell>{instance.template_name}</TableCell>
                      <TableCell>{instance.context_date}</TableCell>
                      <TableCell>{Number(instance.completed_items)}/{Number(instance.total_items)}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[instance.status] || 'bg-gray-100'}`}>
                          {instance.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedInstance(instance.id);
                            setActiveTab('event-log');
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <h2 className="text-lg font-semibold">Completed Instances</h2>

          {instancesLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : completedInstances.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completed instances for the selected filters.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Completed At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedInstances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.employee_name}</TableCell>
                      <TableCell>{instance.template_name}</TableCell>
                      <TableCell>{instance.context_date}</TableCell>
                      <TableCell>{instance.completed_at ? format(new Date(instance.completed_at), 'MMM d, h:mm a') : '-'}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[instance.status] || 'bg-gray-100'}`}>
                          {instance.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {instance.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => reviewInstanceMutation.mutate(instance.id)}
                              disabled={reviewInstanceMutation.isPending}
                            >
                              Review
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedInstance(instance.id);
                              setActiveTab('event-log');
                            }}
                          >
                            <BookOpen className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="event-log" className="space-y-4">
          <h2 className="text-lg font-semibold">Event Log</h2>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label>Select Instance</Label>
                  <Select
                    value={selectedInstance ? String(selectedInstance) : ''}
                    onValueChange={(v) => setSelectedInstance(v ? Number(v) : null)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select an instance..." /></SelectTrigger>
                    <SelectContent>
                      {activeInstances.map(inst => (
                        <SelectItem key={inst.id} value={String(inst.id)}>
                          {inst.employee_name} — {inst.template_name} ({inst.context_date})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedInstance && (
            eventsLoading ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : instanceEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No events recorded for this instance.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>New Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instanceEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(event.created_at), 'MMM d, h:mm:ss a')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{event.event_type.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>{event.actor_display_name || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{event.previous_value ?? '—'}</TableCell>
                        <TableCell className="text-sm font-medium">{event.new_value ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <h2 className="text-lg font-semibold">Legacy Completion History</h2>

          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Employee</Label>
                  <Select
                    value={historyFilters.employeeId}
                    onValueChange={(v) => { setHistoryFilters(prev => ({ ...prev, employeeId: v === 'all' ? '' : v })); setHistoryPage(0); }}
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
                    onValueChange={(v) => { setHistoryFilters(prev => ({ ...prev, templateId: v === 'all' ? '' : v })); setHistoryPage(0); }}
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
                    onChange={(e) => { setHistoryFilters(prev => ({ ...prev, from: e.target.value })); setHistoryPage(0); }}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={historyFilters.to}
                    onChange={(e) => { setHistoryFilters(prev => ({ ...prev, to: e.target.value })); setHistoryPage(0); }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : historyRecords.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completion records found for the selected filters.</p>
              </CardContent>
            </Card>
          ) : (
            <>
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
                    {historyRecords.map((record) => (
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
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {historyPage + 1} — showing {historyRecords.length} records
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyRecords.length < PAGE_SIZE}
                  onClick={() => setHistoryPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
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
            <DialogTitle>Assign Checklist</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Assignment Type</Label>
              <Select value={assignmentType} onValueChange={(v) => setAssignmentType(v as 'employee' | 'department' | 'role')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Specific Employees</SelectItem>
                  <SelectItem value="department">Entire Department</SelectItem>
                  <SelectItem value="role">By Role</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignmentType === 'employee' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Select employees to assign to this checklist. Already-assigned employees will be kept.
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
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
              </>
            )}

            {assignmentType === 'department' && (
              <div>
                <Label>Department</Label>
                <Select value={assignDepartment} onValueChange={setAssignDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">All employees in this department will be covered by this assignment.</p>
              </div>
            )}

            {assignmentType === 'role' && (
              <div>
                <Label>Role</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger><SelectValue placeholder="Select role..." /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">All employees with this role will be covered by this assignment.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBulkAssign}
              disabled={
                (assignmentType === 'employee' && selectedEmployees.length === 0) ||
                (assignmentType === 'department' && !assignDepartment) ||
                (assignmentType === 'role' && !assignRole) ||
                bulkAssignMutation.isPending || assignByGroupMutation.isPending
              }
            >
              {(bulkAssignMutation.isPending || assignByGroupMutation.isPending) ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createInstanceDialogOpen} onOpenChange={setCreateInstanceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Checklist Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template</Label>
              <Select
                value={createInstanceForm.templateId}
                onValueChange={(v) => setCreateInstanceForm(prev => ({ ...prev, templateId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee</Label>
              <Select
                value={createInstanceForm.employeeId}
                onValueChange={(v) => setCreateInstanceForm(prev => ({ ...prev, employeeId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={createInstanceForm.contextDate}
                onChange={(e) => setCreateInstanceForm(prev => ({ ...prev, contextDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Context Type</Label>
              <Select
                value={createInstanceForm.contextType}
                onValueChange={(v) => setCreateInstanceForm(prev => ({ ...prev, contextType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInstanceDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!createInstanceForm.templateId || !createInstanceForm.employeeId || !createInstanceForm.contextDate || createInstanceMutation.isPending}
              onClick={() => {
                createInstanceMutation.mutate({
                  templateId: Number(createInstanceForm.templateId),
                  employeeId: Number(createInstanceForm.employeeId),
                  contextDate: createInstanceForm.contextDate,
                  contextType: createInstanceForm.contextType,
                }, {
                  onSuccess: () => setCreateInstanceDialogOpen(false),
                });
              }}
            >
              {createInstanceMutation.isPending ? 'Creating...' : 'Create Instance'}
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
            Add Assignment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a: any) => (
              <Badge key={a.id} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                {a.assignment_type === 'department' ? (
                  <span>Dept: {a.department_name}</span>
                ) : a.assignment_type === 'role' ? (
                  <span>Role: {a.role_key}</span>
                ) : (
                  <>
                    {a.employee_name || a.employeeName}
                    {(a.employee_department || a.employeeDepartment) && (
                      <span className="text-xs opacity-70">({a.employee_department || a.employeeDepartment})</span>
                    )}
                  </>
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

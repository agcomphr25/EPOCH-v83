import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Calendar,
  ClipboardList,
  History,
  RefreshCw,
  ExternalLink,
  Loader2,
  Receipt,
} from 'lucide-react';
import { format, isAfter, isBefore, startOfDay } from 'date-fns';
import { Link } from 'wouter';
import PendingSignatureTasks from './PendingSignatureTasks';
import P2InvoicePreviewButton from './p2/P2InvoicePreviewButton';

interface AssignedTask {
  id: string;
  description: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  assignedTo: string | null;
  assignedToEmployeeId: number | null;
  link: string | null;
  createdAt: string;
  sectionId: string;
  sectionName: string;
  checklistId: string;
  projectName: string;
  projectId: string;
  poNumber: string | null;
  dueDate: string | null;
  preProductionDueDate: string | null;
  checklistStatus: string;
  source: 'preproduction-checklist';
}

interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
}

interface MyTasksResponse {
  tasks: AssignedTask[];
  stats: TaskStats;
}

interface TimekeepingApprovalTask {
  id: string;
  type: 'pto_approval' | 'punch_correction_approval' | 'salaried_timesheet_approval' | 'hourly_timesheet_approval' | 'hourly_timesheet_blocked' | 'salaried_timesheet_blocked' | 'forklift_evaluation' | 'p2_invoice_posting_group';
  title: string;
  description: string;
  employeeName: string;
  startDate?: string;
  endDate?: string;
  requestUnit?: string | null;
  requestedHours?: number | null;
  employeeNote?: string | null;
  createdAt: string;
  priority: 'normal' | 'overdue';
  actionUrl: string;
  sourceId: number;
  requestType?: string;
  writtenScore?: number;
  testType?: string;
  customerId?: string;
  customerName?: string;
  packingSlipCount?: number;
  oldestCreatedAt?: string;
  newestCreatedAt?: string;
  graceDays?: number;
  overdueDays?: number;
  items?: P2BillingTaskItem[];
}

interface P2BillingTaskItem {
  id: string;
  packingSlipNumber: string;
  poNumber: string | null;
  lotNumberId: string | null;
  shipmentNumber: string | null;
  createdAt: string;
  shipDate: string | null;
  status: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
}

interface TimekeepingTasksResponse {
  tasks: TimekeepingApprovalTask[];
  stats: TaskStats;
}

interface ApprovalDashboardTask {
  id: string;
  type: 'approval_request';
  title: string;
  description: string;
  requestType: string;
  requestedByDisplayName: string;
  createdAt: string;
  dueAt: string | null;
  priority: 'normal' | 'overdue';
  actionUrl: string;
  sourceId: string;
}

interface ApprovalTasksResponse {
  tasks: ApprovalDashboardTask[];
  stats: TaskStats;
}

interface MyTasksControlCenterProps {
  employeeId: number;
  userName?: string;
  compact?: boolean;
}

export default function MyTasksControlCenter({
  employeeId,
  userName,
  compact = false,
}: MyTasksControlCenterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const { data: tasksData, isLoading, refetch } = useQuery<MyTasksResponse>({
    queryKey: ['/api/preproduction-checklists/my-tasks', employeeId, activeTab],
    queryFn: () =>
      apiRequest(
        `/api/preproduction-checklists/my-tasks/${employeeId}?status=${activeTab === 'all' ? '' : activeTab}`
      ),
    enabled: !!employeeId,
  });

  const { data: historyData } = useQuery<AssignedTask[]>({
    queryKey: ['/api/preproduction-checklists/my-tasks', employeeId, 'history'],
    queryFn: () =>
      apiRequest(`/api/preproduction-checklists/my-tasks/${employeeId}/history`),
    enabled: !!employeeId && activeTab === 'history',
  });

  const { data: signatureStats } = useQuery<{ pending: number; completed: number; initiated: number }>({
    queryKey: ['/api/signature-workflow/stats', employeeId],
    queryFn: () => apiRequest(`/api/signature-workflow/stats/${employeeId}`),
    enabled: !!employeeId,
  });

  const { data: timekeepingTasksData, isError: timekeepingTasksError } = useQuery<TimekeepingTasksResponse>({
    queryKey: ['/api/timekeeping/my-tasks', employeeId],
    queryFn: () => apiRequest(`/api/timekeeping/my-tasks/${employeeId}`),
    enabled: !!employeeId,
    refetchInterval: 60_000,
  });

  const { data: approvalTasksData } = useQuery<ApprovalTasksResponse>({
    queryKey: ['/api/approvals/my-tasks', employeeId],
    queryFn: () => apiRequest(`/api/approvals/my-tasks/${employeeId}`),
    enabled: !!employeeId,
    refetchInterval: 60_000,
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: any }) =>
      apiRequest(`/api/preproduction-checklists/tasks/${taskId}`, {
        method: 'PATCH',
        body: { ...data, completedBy: userName },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/preproduction-checklists/my-tasks'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/preproduction-checklists'],
      });
      toast({ title: 'Task updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    },
  });

  const tasks = tasksData?.tasks || [];
  const timekeepingTasks = timekeepingTasksError ? [] : timekeepingTasksData?.tasks || [];
  const billingTasks = timekeepingTasks.filter((task) => task.type === 'p2_invoice_posting_group');
  const workflowTimekeepingTasks = timekeepingTasks.filter((task) => task.type !== 'p2_invoice_posting_group');
  const approvalTasks = approvalTasksData?.tasks || [];
  const baseStats = tasksData?.stats || { total: 0, completed: 0, pending: 0, overdue: 0 };
  const sigPending = signatureStats?.pending || 0;
  const timekeepingPending = timekeepingTasksError ? 0 : timekeepingTasksData?.stats?.pending || 0;
  const timekeepingOverdue = timekeepingTasksError ? 0 : timekeepingTasksData?.stats?.overdue || 0;
  const approvalPending = approvalTasksData?.stats?.pending || 0;
  const approvalOverdue = approvalTasksData?.stats?.overdue || 0;
  const stats = {
    total: baseStats.total + sigPending + timekeepingPending + approvalPending,
    completed: baseStats.completed,
    pending: baseStats.pending + sigPending + timekeepingPending + approvalPending,
    overdue: baseStats.overdue + timekeepingOverdue + approvalOverdue,
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.projectName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject =
      projectFilter === 'all' || task.projectName === projectFilter;
    return matchesSearch && matchesProject;
  });

  const uniqueProjects = [...new Set(tasks.map((t) => t.projectName))];

  const groupedByProject = filteredTasks.reduce((acc, task) => {
    const key = task.projectName;
    if (!acc[key]) {
      acc[key] = {
        projectName: task.projectName,
        projectId: task.projectId,
        checklistId: task.checklistId,
        dueDate: task.dueDate,
        tasks: [],
      };
    }
    acc[key].tasks.push(task);
    return acc;
  }, {} as Record<string, { projectName: string; projectId: string; checklistId: string; dueDate: string | null; tasks: AssignedTask[] }>);

  const sortedProjects = Object.values(groupedByProject).sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const toggleProject = (projectName: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectName)) {
      newExpanded.delete(projectName);
    } else {
      newExpanded.add(projectName);
    }
    setExpandedProjects(newExpanded);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return isBefore(new Date(dueDate), startOfDay(new Date()));
  };

  const completionPercentage =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  if (compact) {
    return (
      <Card data-testid="my-tasks-compact">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            My Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {stats.completed}/{stats.total} completed
                </span>
              </div>
              <Progress value={completionPercentage} className="h-2" />

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-blue-50 rounded">
                  <div className="text-lg font-bold text-blue-600">{stats.pending}</div>
                  <div className="text-xs text-blue-700">Pending</div>
                </div>
                <div className="p-2 bg-green-50 rounded">
                  <div className="text-lg font-bold text-green-600">{stats.completed}</div>
                  <div className="text-xs text-green-700">Done</div>
                </div>
                <div className="p-2 bg-red-50 rounded">
                  <div className="text-lg font-bold text-red-600">{stats.overdue}</div>
                  <div className="text-xs text-red-700">Overdue</div>
                </div>
              </div>

              <PendingSignatureTasks
                employeeId={employeeId}
                employeeName={userName || ''}
                compact={true}
              />

              <ApprovalRequestTasks tasks={approvalTasks} compact={true} />

              <P2BillingTasks tasks={billingTasks} compact={true} />

              <TimekeepingApprovalTasks tasks={workflowTimekeepingTasks} compact={true} />

              {filteredTasks.some((t) => !t.isCompleted) && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Next Tasks:</p>
                  {filteredTasks
                    .filter((t) => !t.isCompleted)
                    .slice(0, 3)
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded"
                      >
                        <Checkbox
                          checked={task.isCompleted}
                          onCheckedChange={(checked) =>
                            updateTaskMutation.mutate({
                              taskId: task.id,
                              data: { isCompleted: checked },
                            })
                          }
                          data-testid={`checkbox-task-compact-${task.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate rainbow-task-text font-semibold">{task.description}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {task.projectName}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="my-tasks-control-center">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              My Tasks
            </CardTitle>
            <CardDescription>
              View and manage all tasks assigned to you
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-blue-50">
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-blue-700">Total Tasks</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50">
            <CardContent className="pt-4 text-center">
              <Clock className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-sm text-yellow-700">Pending</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50">
            <CardContent className="pt-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-green-700">Completed</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50">
            <CardContent className="pt-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-red-600 mb-1" />
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-sm text-red-700">Overdue</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span className="font-medium">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-3" />
        </div>

        <PendingSignatureTasks
          employeeId={employeeId}
          employeeName={userName || ''}
          compact={true}
        />

        <ApprovalRequestTasks tasks={approvalTasks} />

        <P2BillingTasks tasks={billingTasks} />

        <TimekeepingApprovalTasks tasks={workflowTimekeepingTasks} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending ({stats.pending})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All Tasks
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-tasks"
              />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-48" data-testid="select-project-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map((project) => (
                  <SelectItem key={project} value={project}>
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>All caught up! No pending tasks.</p>
              </div>
            ) : (
              sortedProjects.map((project) => (
                <ProjectTaskGroup
                  key={project.projectName}
                  project={project}
                  isExpanded={expandedProjects.has(project.projectName)}
                  onToggle={() => toggleProject(project.projectName)}
                  onUpdateTask={(taskId, data) =>
                    updateTaskMutation.mutate({ taskId, data })
                  }
                  isOverdue={isOverdue}
                  isPending={updateTaskMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No completed tasks yet.</p>
              </div>
            ) : (
              sortedProjects.map((project) => (
                <ProjectTaskGroup
                  key={project.projectName}
                  project={project}
                  isExpanded={expandedProjects.has(project.projectName)}
                  onToggle={() => toggleProject(project.projectName)}
                  onUpdateTask={(taskId, data) =>
                    updateTaskMutation.mutate({ taskId, data })
                  }
                  isOverdue={isOverdue}
                  isPending={updateTaskMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tasks assigned to you.</p>
              </div>
            ) : (
              sortedProjects.map((project) => (
                <ProjectTaskGroup
                  key={project.projectName}
                  project={project}
                  isExpanded={expandedProjects.has(project.projectName)}
                  onToggle={() => toggleProject(project.projectName)}
                  onUpdateTask={(taskId, data) =>
                    updateTaskMutation.mutate({ taskId, data })
                  }
                  isOverdue={isOverdue}
                  isPending={updateTaskMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {!historyData ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No task history yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyData.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 border rounded-lg bg-green-50"
                  >
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-through rainbow-task-text opacity-70">
                        {task.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.projectName} - {task.sectionName}
                      </p>
                    </div>
                    {task.completedAt && (
                      <p className="text-xs text-green-600">
                        {format(new Date(task.completedAt), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function P2BillingTasks({
  tasks,
  compact = false,
}: {
  tasks: TimekeepingApprovalTask[];
  compact?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const snoozeMutation = useMutation({
    mutationFn: (customerId: string) =>
      apiRequest(`/api/timekeeping/my-tasks/p2-billing/${encodeURIComponent(customerId)}/snooze`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast({
        title: 'Billing task snoozed',
        description: 'It will return tomorrow if the invoice still has not been posted.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/my-tasks'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Unable to snooze billing task',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (tasks.length === 0) return null;

  const visibleTasks = compact ? tasks.slice(0, 2) : tasks;

  return (
    <div className="space-y-2" data-testid="p2-billing-tasks">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">
          Billing Follow-up
        </p>
        <Badge variant="outline">{tasks.reduce((sum, task) => sum + Number(task.packingSlipCount || 0), 0)}</Badge>
      </div>
      {visibleTasks.map((task) => {
        const items = task.items || [];
        return (
          <div
            key={task.id}
            className={`space-y-3 p-3 border rounded-lg ${
              task.priority === 'overdue'
                ? 'bg-red-50/70 border-red-200'
                : 'bg-amber-50/70 border-amber-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {task.priority === 'overdue' ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 text-red-700 shrink-0" />
              ) : (
                <Receipt className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                {task.oldestCreatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Oldest packing slip: {format(new Date(task.oldestCreatedAt), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => task.customerId && snoozeMutation.mutate(task.customerId)}
                  disabled={!task.customerId || snoozeMutation.isPending}
                >
                  Snooze
                </Button>
                <Link href={task.actionUrl}>
                  <Button variant="outline" size="sm">
                    Review
                  </Button>
                </Link>
              </div>
            </div>

            {!compact && items.length > 0 && (
              <div className="space-y-2">
                {items.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-md bg-white/70 border px-2 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {item.packingSlipNumber}
                        {item.poNumber ? ` - PO ${item.poNumber}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.invoiceNumber
                          ? `Invoice ${item.invoiceNumber} is ${item.invoiceStatus || 'not posted'}`
                          : 'No invoice created yet'}
                      </p>
                    </div>
                    <Link href={`/p2/packing-slip/${item.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                    {item.invoiceId ? (
                      <Link href={`/finance/invoices/${item.invoiceId}`}>
                        <Button variant="outline" size="sm">
                          Open Invoice
                        </Button>
                      </Link>
                    ) : (
                      <P2InvoicePreviewButton
                        packingSlipId={item.id}
                        size="sm"
                        label="Create Invoice"
                        onCreated={() => queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/my-tasks'] })}
                      />
                    )}
                  </div>
                ))}
                {items.length > 5 && (
                  <p className="text-xs text-muted-foreground px-1">
                    {items.length - 5} more packing slip{items.length - 5 === 1 ? '' : 's'} need review.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApprovalRequestTasks({
  tasks,
  compact = false,
}: {
  tasks: ApprovalDashboardTask[];
  compact?: boolean;
}) {
  if (tasks.length === 0) return null;

  const visibleTasks = compact ? tasks.slice(0, 3) : tasks;

  return (
    <div className="space-y-2" data-testid="approval-request-tasks">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">
          Assigned Approvals
        </p>
        <Badge variant="outline">{tasks.length}</Badge>
      </div>
      {visibleTasks.map((task) => (
        <div
          key={task.id}
          className={`flex items-start gap-3 p-3 border rounded-lg ${
            task.priority === 'overdue'
              ? 'bg-red-50/70 border-red-200'
              : 'bg-blue-50/70 border-blue-200'
          }`}
        >
          <ClipboardList className="h-4 w-4 mt-0.5 text-blue-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{task.title}</p>
            <p className="text-xs text-muted-foreground truncate">{task.description}</p>
            <p className="text-xs text-muted-foreground truncate">
              Requested by {task.requestedByDisplayName}
            </p>
          </div>
          <Link href={task.actionUrl}>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}

function TimekeepingApprovalTasks({
  tasks,
  compact = false,
}: {
  tasks: TimekeepingApprovalTask[];
  compact?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reviewTarget, setReviewTarget] = useState<{
    task: TimekeepingApprovalTask;
    decision: 'approved' | 'denied';
  } | null>(null);
  const [forkliftTarget, setForkliftTarget] = useState<TimekeepingApprovalTask | null>(null);
  const [forkliftItems, setForkliftItems] = useState<
    { itemKey: string; label: string; required: boolean; result: string; notes: string }[]
  >([]);
  const [forkliftNotes, setForkliftNotes] = useState('');
  const [note, setNote] = useState('');

  const { data: forkliftEvaluation, isLoading: forkliftLoading } = useQuery({
    queryKey: ['/api/training/forklift/evaluations', forkliftTarget?.sourceId],
    queryFn: () => apiRequest(`/api/training/forklift/evaluations/${forkliftTarget?.sourceId}`),
    enabled: !!forkliftTarget?.sourceId,
  });

  useEffect(() => {
    if (!forkliftTarget || !forkliftEvaluation?.items?.length) return;
    setForkliftItems(
      forkliftEvaluation.items.map((item: any) => ({
        itemKey: item.item_key || item.itemKey,
        label: item.label,
        required: item.required !== false,
        result: item.result || 'pending',
        notes: item.notes || '',
      })),
    );
  }, [forkliftEvaluation, forkliftTarget]);

  const forkliftCompleteMutation = useMutation({
    mutationFn: ({
      task,
      certify,
      items,
      evaluatorNotes,
    }: {
      task: TimekeepingApprovalTask;
      certify: boolean;
      items: typeof forkliftItems;
      evaluatorNotes: string;
    }) =>
      apiRequest(`/api/training/forklift/evaluations/${task.sourceId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          certify,
          evaluatorNotes,
          items,
        }),
      }),
    onSuccess: (data: any, vars) => {
      toast({
        title: vars.certify ? 'Forklift certification completed' : 'Forklift evaluation marked unsatisfactory',
        description: vars.certify
          ? 'The laminated badge PDF is opening in a new tab.'
          : 'The employee will need coaching or another evaluation.',
      });
      if (vars.certify && data?.evaluation?.id) {
        window.open(`/api/training/forklift/evaluations/${data.evaluation.id}/badge.pdf`, '_blank', 'noopener,noreferrer');
      }
      setForkliftTarget(null);
      setForkliftItems([]);
      setForkliftNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/my-tasks'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Unable to save forklift evaluation',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      task,
      decision,
      note,
    }: {
      task: TimekeepingApprovalTask;
      decision: 'approved' | 'denied';
      note: string;
    }) => {
      if (task.type === 'hourly_timesheet_approval') {
        return apiRequest(
          `/api/timekeeping/timesheets/${task.sourceId}/${decision === 'approved' ? 'approve' : 'reject'}`,
          {
            method: 'POST',
            body: decision === 'denied' ? JSON.stringify({ rejectionNote: note }) : undefined,
          },
        );
      }
      if (task.type === 'salaried_timesheet_approval') {
        return apiRequest(
          `/api/timekeeping/salaried-timesheet/${task.sourceId}/${decision === 'approved' ? 'supervisor-approve' : 'supervisor-reject'}`,
          {
            method: 'POST',
            body: JSON.stringify(decision === 'approved' ? { note: note || undefined } : { note }),
          },
        );
      }
      if (task.type === 'punch_correction_approval') {
        return apiRequest(`/api/timekeeping/punch-corrections/${task.sourceId}/supervisor-review`, {
          method: 'POST',
          body: JSON.stringify({ decision, note }),
        });
      }
      return apiRequest(`/api/timekeeping/time-off/${task.sourceId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          stage: 'supervisor',
          decision,
          note: note || undefined,
        }),
      });
    },
    onSuccess: (_data, vars) => {
      toast({
        title: vars.decision === 'approved' ? 'Review approved' : 'Review rejected',
        description: vars.task.type === 'pto_approval'
          ? vars.decision === 'approved'
            ? 'The request has been advanced for the next review.'
            : 'The employee will be notified of the denial.'
          : vars.task.type === 'punch_correction_approval'
            ? vars.decision === 'approved'
              ? 'The punch edit has been advanced to payroll review.'
              : 'The employee will be notified of the denial.'
          : vars.decision === 'approved'
            ? 'The timesheet is ready for payroll approval.'
            : 'The timesheet has been returned for correction.',
      });
      setReviewTarget(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punch-corrections'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Unable to update review',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (tasks.length === 0) return null;

  const visibleTasks = compact ? tasks.slice(0, 3) : tasks;
  const requestReviewTarget = reviewTarget && ['pto_approval', 'punch_correction_approval'].includes(reviewTarget.task.type)
    ? reviewTarget
    : null;
  const timesheetReviewTarget = reviewTarget && ['hourly_timesheet_approval', 'salaried_timesheet_approval'].includes(reviewTarget.task.type)
    ? reviewTarget
    : null;
  const hasFailingForkliftItem = forkliftItems.some((item) => item.required && item.result === 'fail');
  const hasPendingForkliftItem = forkliftItems.some((item) => item.required && item.result === 'pending');

  return (
    <>
      <div className="space-y-2" data-testid="timekeeping-approval-tasks">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">
            Timekeeping Approvals
          </p>
          <Badge variant="outline">{tasks.length}</Badge>
        </div>
        {visibleTasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-start gap-3 p-3 border rounded-lg ${
              task.type.endsWith('_blocked')
                ? 'bg-red-50/70 border-red-200'
                : 'bg-amber-50/70 border-amber-200'
            }`}
          >
            {task.type.endsWith('_blocked') ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 text-red-700 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground truncate">{task.description}</p>
            </div>
            {task.type === 'pto_approval' || task.type === 'punch_correction_approval' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewTarget({ task, decision: 'approved' })}
                data-testid={`button-review-${task.type === 'pto_approval' ? 'pto' : 'punch-correction'}-${task.sourceId}`}
              >
                Review
              </Button>
            ) : task.type === 'forklift_evaluation' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForkliftTarget(task)}
                data-testid={`button-review-forklift-${task.sourceId}`}
              >
                Evaluate
              </Button>
            ) : task.type === 'hourly_timesheet_approval' || task.type === 'salaried_timesheet_approval' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewTarget({ task, decision: 'approved' })}
                data-testid={`button-review-timesheet-${task.sourceId}`}
              >
                Review
              </Button>
            ) : (
              <Link href={task.actionUrl}>
                <Button variant="outline" size="sm">
                  Follow up
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>

      <Dialog
        open={!!requestReviewTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {requestReviewTarget?.task.type === 'punch_correction_approval' ? 'Review Punch Edit' : 'Review PTO Request'}
            </DialogTitle>
          </DialogHeader>
          {requestReviewTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold">{requestReviewTarget.task.employeeName}</div>
                {requestReviewTarget.task.type === 'punch_correction_approval' ? (
                  <div className="text-muted-foreground">{requestReviewTarget.task.description}</div>
                ) : (
                  <>
                    <div className="text-muted-foreground">
                      {requestReviewTarget.task.startDate || 'Start date'} to {requestReviewTarget.task.endDate || 'End date'}
                      {requestReviewTarget.task.requestedHours != null
                        ? ` - ${requestReviewTarget.task.requestedHours} hours`
                        : ''}
                    </div>
                    {requestReviewTarget.task.requestUnit && (
                      <div className="text-muted-foreground">
                        Unit: {requestReviewTarget.task.requestUnit.replace(/_/g, ' ')}
                      </div>
                    )}
                  </>
                )}
                {requestReviewTarget.task.employeeNote && (
                  <div className="pt-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Employee note:</span>{' '}
                    {requestReviewTarget.task.employeeNote}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={requestReviewTarget.decision === 'approved' ? 'default' : 'outline'}
                  onClick={() => setReviewTarget({ ...requestReviewTarget, decision: 'approved' })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant={requestReviewTarget.decision === 'denied' ? 'destructive' : 'outline'}
                  onClick={() => setReviewTarget({ ...requestReviewTarget, decision: 'denied' })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Deny
                </Button>
              </div>

              <div className="space-y-1">
                <Label>
                  {requestReviewTarget.task.type === 'punch_correction_approval'
                    ? 'Supervisor note'
                    : requestReviewTarget.decision === 'denied'
                      ? 'Denial reason'
                      : 'Note'}
                  {(requestReviewTarget.task.type === 'punch_correction_approval' || requestReviewTarget.decision === 'denied') && <span className="text-red-500"> *</span>}
                </Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={requestReviewTarget.task.type === 'punch_correction_approval' || requestReviewTarget.decision === 'denied' ? 'Required for review' : 'Optional'}
                  rows={3}
                  className="resize-none"
                  data-testid="textarea-timekeeping-request-review-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewTarget(null);
                setNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={requestReviewTarget?.decision === 'denied' ? 'destructive' : 'default'}
              disabled={
                reviewMutation.isPending ||
                (requestReviewTarget?.task.type === 'punch_correction_approval' && note.trim().length < 3) ||
                (requestReviewTarget?.decision === 'denied' && !note.trim())
              }
              onClick={() => {
                if (!requestReviewTarget) return;
                if (requestReviewTarget.task.type === 'punch_correction_approval' && note.trim().length < 3) return;
                if (requestReviewTarget.decision === 'denied' && !note.trim()) return;
                reviewMutation.mutate({
                  task: requestReviewTarget.task,
                  decision: requestReviewTarget.decision,
                  note: note.trim(),
                });
              }}
              data-testid="button-submit-timekeeping-request-review"
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {requestReviewTarget?.decision === 'denied' ? 'Submit Denial' : 'Approve Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!timesheetReviewTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Timesheet</DialogTitle>
          </DialogHeader>
          {timesheetReviewTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold">{timesheetReviewTarget.task.employeeName}</div>
                <div className="text-muted-foreground">{timesheetReviewTarget.task.description}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={timesheetReviewTarget.decision === 'approved' ? 'default' : 'outline'}
                  onClick={() => setReviewTarget({ ...timesheetReviewTarget, decision: 'approved' })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant={timesheetReviewTarget.decision === 'denied' ? 'destructive' : 'outline'}
                  onClick={() => setReviewTarget({ ...timesheetReviewTarget, decision: 'denied' })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>

              <div className="space-y-1">
                <Label>
                  {timesheetReviewTarget.decision === 'denied' ? 'Rejection reason' : 'Approval note'}
                  {timesheetReviewTarget.decision === 'denied' && <span className="text-red-500"> *</span>}
                </Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={timesheetReviewTarget.decision === 'denied' ? 'Required for rejection' : 'Optional'}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewTarget(null);
                setNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={timesheetReviewTarget?.decision === 'denied' ? 'destructive' : 'default'}
              disabled={
                reviewMutation.isPending ||
                (timesheetReviewTarget?.decision === 'denied' && note.trim().length < 3)
              }
              onClick={() => {
                if (!timesheetReviewTarget) return;
                if (timesheetReviewTarget.decision === 'denied' && note.trim().length < 3) return;
                reviewMutation.mutate({
                  task: timesheetReviewTarget.task,
                  decision: timesheetReviewTarget.decision,
                  note: note.trim(),
                });
              }}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {timesheetReviewTarget?.decision === 'denied' ? 'Reject Timesheet' : 'Approve Timesheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!forkliftTarget}
        onOpenChange={(open) => {
          if (!open) {
            setForkliftTarget(null);
            setForkliftItems([]);
            setForkliftNotes('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Forklift Practical Evaluation</DialogTitle>
          </DialogHeader>
          {forkliftTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold">{forkliftTarget.employeeName}</div>
                <div className="text-muted-foreground">
                  Sit-down counterbalance forklift - written test score {forkliftTarget.writtenScore ?? '80'}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Needs Coaching is acceptable when the overall evaluation is satisfactory. Required Fail items block certification.
                </div>
              </div>

              {forkliftLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading checklist...
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {forkliftItems.map((item, index) => (
                    <div key={item.itemKey} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{index + 1}. {item.label}</p>
                          {item.required && <p className="text-xs text-muted-foreground">Required</p>}
                        </div>
                        <Select
                          value={item.result}
                          onValueChange={(value) => {
                            setForkliftItems((prev) =>
                              prev.map((row) =>
                                row.itemKey === item.itemKey ? { ...row, result: value } : row,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="pass">Pass</SelectItem>
                            <SelectItem value="needs_coaching">Needs Coaching</SelectItem>
                            <SelectItem value="fail">Fail</SelectItem>
                            <SelectItem value="na">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={item.notes}
                        onChange={(event) => {
                          const notes = event.target.value;
                          setForkliftItems((prev) =>
                            prev.map((row) =>
                              row.itemKey === item.itemKey ? { ...row, notes } : row,
                            ),
                          );
                        }}
                        placeholder="Notes for this checklist item"
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <Label>Evaluator notes</Label>
                <Textarea
                  value={forkliftNotes}
                  onChange={(event) => setForkliftNotes(event.target.value)}
                  placeholder="Overall observations, coaching given, mini-course notes"
                  rows={3}
                  className="resize-none"
                />
              </div>

              {hasFailingForkliftItem && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  One or more required items are marked Fail. Mark this evaluation unsatisfactory or update the result after coaching.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setForkliftTarget(null);
                setForkliftItems([]);
                setForkliftNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={!forkliftTarget || forkliftCompleteMutation.isPending}
              onClick={() => {
                if (!forkliftTarget) return;
                forkliftCompleteMutation.mutate({
                  task: forkliftTarget,
                  certify: false,
                  items: forkliftItems,
                  evaluatorNotes: forkliftNotes.trim(),
                });
              }}
            >
              Mark Unsatisfactory
            </Button>
            <Button
              disabled={
                !forkliftTarget ||
                forkliftCompleteMutation.isPending ||
                hasFailingForkliftItem ||
                hasPendingForkliftItem
              }
              onClick={() => {
                if (!forkliftTarget) return;
                forkliftCompleteMutation.mutate({
                  task: forkliftTarget,
                  certify: true,
                  items: forkliftItems,
                  evaluatorNotes: forkliftNotes.trim(),
                });
              }}
              data-testid="button-submit-forklift-evaluation"
            >
              {forkliftCompleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Certify Operator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProjectTaskGroup({
  project,
  isExpanded,
  onToggle,
  onUpdateTask,
  isOverdue,
  isPending,
}: {
  project: {
    projectName: string;
    projectId: string;
    checklistId: string;
    dueDate: string | null;
    tasks: AssignedTask[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateTask: (taskId: string, data: any) => void;
  isOverdue: (date: string | null) => boolean;
  isPending: boolean;
}) {
  const completedCount = project.tasks.filter((t) => t.isCompleted).length;
  const totalCount = project.tasks.length;
  const hasOverdue = isOverdue(project.dueDate) && completedCount < totalCount;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div
          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
            hasOverdue ? 'border-red-300 bg-red-50' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{project.projectName}</span>
                <Badge variant="outline">
                  {completedCount}/{totalCount}
                </Badge>
                {hasOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    Overdue
                  </Badge>
                )}
              </div>
              {project.dueDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due: {format(new Date(project.dueDate), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
          <Link href={`/preproduction-checklists`}>
            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-8 pr-2 py-2 space-y-2">
        {project.tasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              task.isCompleted ? 'bg-green-50 border-green-200' : 'bg-white'
            }`}
            data-testid={`task-item-${task.id}`}
          >
            <Checkbox
              checked={task.isCompleted}
              disabled={isPending}
              onCheckedChange={(checked) =>
                onUpdateTask(task.id, { isCompleted: checked })
              }
              data-testid={`checkbox-task-${task.id}`}
            />
            <div className="flex-1 min-w-0">
              <p
                className={`rainbow-task-text font-semibold ${
                  task.isCompleted ? 'line-through opacity-70' : ''
                }`}
              >
                {task.description}
              </p>
              <p className="text-xs text-muted-foreground">
                Section: {task.sectionName}
              </p>
              {task.completedAt && (
                <p className="text-xs text-green-600">
                  Completed {format(new Date(task.completedAt), 'MMM d, yyyy h:mm a')}
                  {task.completedBy && ` by ${task.completedBy}`}
                </p>
              )}
            </div>
            {task.link && !task.isCompleted && (
              <Link href={task.link}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-open-task-${task.id}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

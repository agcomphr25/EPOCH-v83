import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { format, isAfter, isBefore, startOfDay } from 'date-fns';
import { Link } from 'wouter';
import PendingSignatureTasks from './PendingSignatureTasks';

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
  type: 'pto_approval' | 'salaried_timesheet_approval' | 'hourly_timesheet_approval';
  title: string;
  description: string;
  employeeName: string;
  createdAt: string;
  priority: 'normal' | 'overdue';
  actionUrl: string;
  sourceId: number;
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

  const { data: timekeepingTasksData } = useQuery<TimekeepingTasksResponse>({
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
  const timekeepingTasks = timekeepingTasksData?.tasks || [];
  const approvalTasks = approvalTasksData?.tasks || [];
  const baseStats = tasksData?.stats || { total: 0, completed: 0, pending: 0, overdue: 0 };
  const sigPending = signatureStats?.pending || 0;
  const timekeepingPending = timekeepingTasksData?.stats?.pending || 0;
  const approvalPending = approvalTasksData?.stats?.pending || 0;
  const approvalOverdue = approvalTasksData?.stats?.overdue || 0;
  const stats = {
    total: baseStats.total + sigPending + timekeepingPending + approvalPending,
    completed: baseStats.completed,
    pending: baseStats.pending + sigPending + timekeepingPending + approvalPending,
    overdue: baseStats.overdue + approvalOverdue,
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

              <TimekeepingApprovalTasks tasks={timekeepingTasks} compact={true} />

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

        <TimekeepingApprovalTasks tasks={timekeepingTasks} />

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
  if (tasks.length === 0) return null;

  const visibleTasks = compact ? tasks.slice(0, 3) : tasks;

  return (
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
          className="flex items-start gap-3 p-3 border rounded-lg bg-amber-50/70 border-amber-200"
        >
          <Clock className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{task.title}</p>
            <p className="text-xs text-muted-foreground truncate">{task.description}</p>
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

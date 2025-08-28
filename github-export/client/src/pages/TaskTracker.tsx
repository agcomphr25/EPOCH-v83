import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, Search, Filter, CheckSquare, Square, Calendar, 
  User, AlertCircle, Clock, Edit, Trash2, Save, X 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TaskItem {
  id: number;
  title: string;
  description?: string;
  category?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
  gjStatus: boolean;
  tmStatus: boolean;
  finishedStatus: boolean;
  assignedTo?: string;
  createdBy: string;
  gjCompletedBy?: string;
  gjCompletedAt?: string;
  tmCompletedBy?: string;
  tmCompletedAt?: string;
  finishedCompletedBy?: string;
  finishedCompletedAt?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TaskTracker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  
  // Form state for new/edit task
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'Medium' as const,
    dueDate: '',
    assignedTo: '',
    notes: ''
  });

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery<TaskItem[]>({
    queryKey: ['/api/task-items'],
    refetchInterval: 30000, // Refresh every 30 seconds for collaboration
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      return apiRequest('/api/task-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...taskData, createdBy: 'Current User' }), // TODO: Get from auth
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Task created successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...taskData }: any) => {
      return apiRequest(`/api/task-items/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
      setEditingTask(null);
      toast({ title: "Task updated successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  // Update checkbox status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, field, value, completedBy }: any) => {
      const updateData: any = { [field]: value };
      if (value) {
        updateData[`${field.replace('Status', 'CompletedBy')}`] = completedBy;
        updateData[`${field.replace('Status', 'CompletedAt')}`] = new Date().toISOString();
      } else {
        updateData[`${field.replace('Status', 'CompletedBy')}`] = null;
        updateData[`${field.replace('Status', 'CompletedAt')}`] = null;
      }
      
      return apiRequest(`/api/task-items/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/task-items/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
      toast({ title: "Task deleted successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to delete task", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      priority: 'Medium',
      dueDate: '',
      assignedTo: '',
      notes: ''
    });
  };

  const handleCreateTask = () => {
    if (!formData.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    createTaskMutation.mutate(formData);
  };

  const handleUpdateTask = (task: TaskItem) => {
    updateTaskMutation.mutate({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      notes: task.notes
    });
  };

  const handleStatusChange = (taskId: number, field: string, currentValue: boolean) => {
    updateStatusMutation.mutate({
      id: taskId,
      field,
      value: !currentValue,
      completedBy: 'Current User' // TODO: Get from auth
    });
  };

  const handleEditClick = (task: TaskItem) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      category: task.category || '',
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      assignedTo: task.assignedTo || '',
      notes: task.notes || ''
    });
    setIsAddDialogOpen(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTaskProgress = (task: TaskItem) => {
    const completed = [task.gjStatus, task.tmStatus, task.finishedStatus].filter(Boolean).length;
    return `${completed}/3`;
  };

  // Filter tasks based on search and filters
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.category?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    
    let matchesStatus = true;
    if (filterStatus === 'completed') {
      matchesStatus = task.finishedStatus;
    } else if (filterStatus === 'in-progress') {
      matchesStatus = (task.gjStatus || task.tmStatus) && !task.finishedStatus;
    } else if (filterStatus === 'pending') {
      matchesStatus = !task.gjStatus && !task.tmStatus && !task.finishedStatus;
    }
    
    return matchesSearch && matchesPriority && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Task Tracker</h1>
              <p className="text-gray-600">Collaborative task management for finalization tracking</p>
            </div>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2" onClick={() => {
                  setEditingTask(null);
                  resetForm();
                }}>
                  <Plus className="h-4 w-4" />
                  Add New Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingTask ? 'Edit Task' : 'Create New Task'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter task title"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter task description"
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="e.g., Design, Production, QC"
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="assignedTo">Assigned To</Label>
                      <Input
                        id="assignedTo"
                        value={formData.assignedTo}
                        onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                        placeholder="Enter assignee name"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes or comments"
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={editingTask ? () => handleUpdateTask({ ...editingTask, ...formData }) : handleCreateTask}
                      disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
                    >
                      {editingTask ? 'Update Task' : 'Create Task'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Filters and Search */}
          <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 min-w-64">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-600" />
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="ml-auto text-sm text-gray-600">
              {filteredTasks.length} of {tasks.length} tasks
            </div>
          </div>
        </div>

        {/* Tasks Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Task Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {tasks.length === 0 ? 'No tasks yet. Create your first task!' : 'No tasks match your filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Task</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600 w-20">GJ</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600 w-20">TM</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600 w-24">Finished</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600 w-24">Progress</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600 w-32">Priority</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600 w-32">Due Date</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-2">
                          <div>
                            <div className="font-medium text-gray-900">{task.title}</div>
                            {task.description && (
                              <div className="text-sm text-gray-600 mt-1">{task.description}</div>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              {task.category && (
                                <span className="bg-gray-100 px-2 py-1 rounded">{task.category}</span>
                              )}
                              {task.assignedTo && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {task.assignedTo}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          <Checkbox
                            checked={task.gjStatus}
                            onCheckedChange={() => handleStatusChange(task.id, 'gjStatus', task.gjStatus)}
                            disabled={updateStatusMutation.isPending}
                          />
                          {task.gjCompletedBy && (
                            <div className="text-xs text-gray-500 mt-1">
                              {task.gjCompletedBy}
                            </div>
                          )}
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          <Checkbox
                            checked={task.tmStatus}
                            onCheckedChange={() => handleStatusChange(task.id, 'tmStatus', task.tmStatus)}
                            disabled={updateStatusMutation.isPending}
                          />
                          {task.tmCompletedBy && (
                            <div className="text-xs text-gray-500 mt-1">
                              {task.tmCompletedBy}
                            </div>
                          )}
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          <Checkbox
                            checked={task.finishedStatus}
                            onCheckedChange={() => handleStatusChange(task.id, 'finishedStatus', task.finishedStatus)}
                            disabled={updateStatusMutation.isPending}
                          />
                          {task.finishedCompletedBy && (
                            <div className="text-xs text-gray-500 mt-1">
                              {task.finishedCompletedBy}
                            </div>
                          )}
                        </td>
                        
                        <td className="py-4 px-2 text-center">
                          <div className="text-sm font-medium">{getTaskProgress(task)}</div>
                        </td>
                        
                        <td className="py-4 px-2">
                          <Badge className={getPriorityColor(task.priority)} variant="outline">
                            {task.priority}
                          </Badge>
                        </td>
                        
                        <td className="py-4 px-2">
                          {task.dueDate ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {new Date(task.dueDate).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">No due date</span>
                          )}
                        </td>
                        
                        <td className="py-4 px-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditClick(task)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this task?')) {
                                  deleteTaskMutation.mutate(task.id);
                                }
                              }}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
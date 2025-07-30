import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Search, BarChart3, AlertTriangle, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertKickbackSchema, type Kickback } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

// Form validation schema
const kickbackFormSchema = insertKickbackSchema.extend({
  kickbackDate: z.date(),
  resolvedAt: z.date().optional().nullable(),
});

type KickbackFormData = z.infer<typeof kickbackFormSchema>;

// Status color mapping
const statusColors = {
  OPEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

// Priority color mapping
const priorityColors = {
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

// Status icons
const statusIcons = {
  OPEN: AlertTriangle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCircle,
  CLOSED: XCircle,
};

export default function KickbackTracking() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedKickback, setSelectedKickback] = useState<Kickback | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all kickbacks
  const { data: kickbacks = [], isLoading } = useQuery({
    queryKey: ['/api/kickbacks'],
    queryFn: () => fetch('/api/kickbacks').then(res => res.json()),
  });

  // Fetch analytics data
  const { data: analytics } = useQuery({
    queryKey: ['/api/kickbacks/analytics'],
    queryFn: () => fetch('/api/kickbacks/analytics').then(res => res.json()),
  });

  // Create kickback mutation
  const createKickbackMutation = useMutation({
    mutationFn: (data: KickbackFormData) =>
      fetch('/api/kickbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks/analytics'] });
      setIsCreateDialogOpen(false);
      toast({ title: 'Success', description: 'Kickback created successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create kickback', variant: 'destructive' });
    },
  });

  // Update kickback mutation
  const updateKickbackMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<KickbackFormData> }) =>
      fetch(`/api/kickbacks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks/analytics'] });
      toast({ title: 'Success', description: 'Kickback updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update kickback', variant: 'destructive' });
    },
  });

  // Form for creating kickbacks
  const form = useForm<KickbackFormData>({
    resolver: zodResolver(kickbackFormSchema),
    defaultValues: {
      kickbackDate: new Date(),
      status: 'OPEN',
      priority: 'MEDIUM',
      impactedDepartments: [],
    },
  });

  // Filter kickbacks based on search and filters
  const filteredKickbacks = kickbacks.filter((kickback: Kickback) => {
    const matchesSearch = kickback.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         kickback.reasonText?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         kickback.reportedBy.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || kickback.status === statusFilter;
    const matchesDepartment = departmentFilter === 'all' || kickback.kickbackDept === departmentFilter;
    
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const onSubmit = (data: KickbackFormData) => {
    createKickbackMutation.mutate(data);
  };

  const handleStatusChange = (kickbackId: number, newStatus: string) => {
    const updateData: Partial<KickbackFormData> = { status: newStatus as any };
    
    if (newStatus === 'RESOLVED' || newStatus === 'CLOSED') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = 'Current User'; // In real app, get from auth context
    }
    
    updateKickbackMutation.mutate({ id: kickbackId, data: updateData });
  };

  if (isLoading) {
    return <div className="p-6">Loading kickback data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Kickback Tracking</h1>
          <p className="text-muted-foreground">Monitor and resolve production issues</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Report Kickback
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Report New Kickback</DialogTitle>
              <DialogDescription>
                Report a production issue that requires attention
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="orderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order ID</FormLabel>
                        <FormControl>
                          <Input placeholder="AG001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="kickbackDept"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Layup">Layup</SelectItem>
                            <SelectItem value="Plugging">Plugging</SelectItem>
                            <SelectItem value="CNC">CNC</SelectItem>
                            <SelectItem value="Finish">Finish</SelectItem>
                            <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                            <SelectItem value="Paint">Paint</SelectItem>
                            <SelectItem value="QC">QC</SelectItem>
                            <SelectItem value="Shipping">Shipping</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="reasonCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason Code</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MATERIAL_DEFECT">Material Defect</SelectItem>
                            <SelectItem value="OPERATOR_ERROR">Operator Error</SelectItem>
                            <SelectItem value="MACHINE_FAILURE">Machine Failure</SelectItem>
                            <SelectItem value="DESIGN_ISSUE">Design Issue</SelectItem>
                            <SelectItem value="QUALITY_ISSUE">Quality Issue</SelectItem>
                            <SelectItem value="PROCESS_ISSUE">Process Issue</SelectItem>
                            <SelectItem value="SUPPLIER_ISSUE">Supplier Issue</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="LOW">Low</SelectItem>
                            <SelectItem value="MEDIUM">Medium</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                            <SelectItem value="CRITICAL">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="kickbackDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Kickback Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reportedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reported By</FormLabel>
                        <FormControl>
                          <Input placeholder="Employee name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reasonText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Detailed description of the issue..."
                          className="resize-none"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createKickbackMutation.isPending}>
                    {createKickbackMutation.isPending ? 'Creating...' : 'Create Kickback'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Kickbacks</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalKickbacks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.resolvedKickbacks}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.totalKickbacks > 0 
                  ? `${Math.round((analytics.resolvedKickbacks / analytics.totalKickbacks) * 100)}% resolution rate`
                  : 'No data'
                }
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Resolution Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.averageResolutionTime 
                  ? `${Math.round(analytics.averageResolutionTime)}d`
                  : 'N/A'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                Days to resolve
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.byStatus?.OPEN || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by order ID, description, or reporter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dept-filter">Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  <SelectItem value="Layup">Layup</SelectItem>
                  <SelectItem value="Plugging">Plugging</SelectItem>
                  <SelectItem value="CNC">CNC</SelectItem>
                  <SelectItem value="Finish">Finish</SelectItem>
                  <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                  <SelectItem value="Paint">Paint</SelectItem>
                  <SelectItem value="QC">QC</SelectItem>
                  <SelectItem value="Shipping">Shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kickbacks List */}
      <Card>
        <CardHeader>
          <CardTitle>Kickbacks ({filteredKickbacks.length})</CardTitle>
          <CardDescription>
            Production issues and their resolution status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredKickbacks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No kickbacks found matching your criteria
            </div>
          ) : (
            <div className="space-y-4">
              {filteredKickbacks.map((kickback: Kickback) => {
                const StatusIcon = statusIcons[kickback.status as keyof typeof statusIcons];
                return (
                  <div key={kickback.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <StatusIcon className="h-4 w-4" />
                          <span className="font-medium">{kickback.orderId}</span>
                          <Badge variant="outline" className={statusColors[kickback.status as keyof typeof statusColors]}>
                            {kickback.status}
                          </Badge>
                          <Badge variant="outline" className={priorityColors[kickback.priority as keyof typeof priorityColors]}>
                            {kickback.priority}
                          </Badge>
                          <Badge variant="secondary">{kickback.kickbackDept}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {kickback.reasonText || kickback.reasonCode}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Reported by {kickback.reportedBy}</span>
                          <span>{format(new Date(kickback.kickbackDate), 'MMM d, yyyy')}</span>
                          {kickback.resolvedAt && (
                            <span>Resolved {format(new Date(kickback.resolvedAt), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedKickback(kickback);
                            setIsViewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {kickback.status === 'OPEN' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(kickback.id, 'IN_PROGRESS')}
                          >
                            Start Work
                          </Button>
                        )}
                        {kickback.status === 'IN_PROGRESS' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(kickback.id, 'RESOLVED')}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kickback Details</DialogTitle>
          </DialogHeader>
          {selectedKickback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Order ID</Label>
                  <p className="font-medium">{selectedKickback.orderId}</p>
                </div>
                <div>
                  <Label>Department</Label>
                  <p className="font-medium">{selectedKickback.kickbackDept}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Badge className={statusColors[selectedKickback.status as keyof typeof statusColors]}>
                    {selectedKickback.status}
                  </Badge>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Badge className={priorityColors[selectedKickback.priority as keyof typeof priorityColors]}>
                    {selectedKickback.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <p className="mt-1 p-3 bg-muted rounded-md">
                  {selectedKickback.reasonText || 'No description provided'}
                </p>
              </div>
              {selectedKickback.rootCause && (
                <div>
                  <Label>Root Cause</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md">{selectedKickback.rootCause}</p>
                </div>
              )}
              {selectedKickback.correctiveAction && (
                <div>
                  <Label>Corrective Action</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md">{selectedKickback.correctiveAction}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <Label>Reported By</Label>
                  <p>{selectedKickback.reportedBy}</p>
                </div>
                <div>
                  <Label>Reported On</Label>
                  <p>{format(new Date(selectedKickback.kickbackDate), 'PPP')}</p>
                </div>
              </div>
              {selectedKickback.resolvedAt && (
                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                  <div>
                    <Label>Resolved By</Label>
                    <p>{selectedKickback.resolvedBy || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label>Resolved On</Label>
                    <p>{format(new Date(selectedKickback.resolvedAt), 'PPP')}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
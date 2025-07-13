import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Clock, Edit, Trash2, Plus, Search, Calendar, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { TimeClockEntry, Employee } from '@shared/schema';

interface TimeClockAdminProps {
  className?: string;
}

export default function TimeClockAdmin({ className }: TimeClockAdminProps) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<TimeClockEntry | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/employees'],
    queryFn: async () => {
      const response = await fetch('/api/employees');
      if (!response.ok) throw new Error('Failed to fetch employees');
      return response.json() as Promise<Employee[]>;
    }
  });

  // Fetch time clock entries
  const { data: timeEntries = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/timeclock/entries', selectedEmployee, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedEmployee && selectedEmployee !== 'all') params.append('employeeId', selectedEmployee);
      if (selectedDate) params.append('date', selectedDate);
      
      const response = await fetch(`/api/timeclock/entries?${params}`);
      if (!response.ok) throw new Error('Failed to fetch time entries');
      return response.json() as Promise<TimeClockEntry[]>;
    }
  });

  // Create entry mutation
  const createEntryMutation = useMutation({
    mutationFn: async (entry: Partial<TimeClockEntry>) => {
      const response = await fetch('/api/timeclock/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!response.ok) throw new Error('Failed to create entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timeclock/entries'] });
      refetch(); // Force refetch the current query
      setIsAddDialogOpen(false);
      toast({ title: 'Time entry created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create time entry', variant: 'destructive' });
    }
  });

  // Update entry mutation
  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, ...entry }: Partial<TimeClockEntry> & { id: number }) => {
      const response = await fetch(`/api/timeclock/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!response.ok) throw new Error('Failed to update entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timeclock/entries'] });
      refetch(); // Force refetch the current query
      setIsEditDialogOpen(false);
      setEditingEntry(null);
      toast({ title: 'Time entry updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update time entry', variant: 'destructive' });
    }
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/timeclock/entries/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timeclock/entries'] });
      refetch(); // Force refetch the current query
      toast({ title: 'Time entry deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete time entry', variant: 'destructive' });
    }
  });

  // Filter entries based on search
  const filteredEntries = timeEntries.filter(entry => {
    if (!searchTerm) return true;
    const employee = employees.find(emp => emp.employeeCode === entry.employeeId);
    return employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           entry.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleEdit = (entry: TimeClockEntry) => {
    setEditingEntry(entry);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this time entry?')) {
      deleteEntryMutation.mutate(id);
    }
  };

  const calculateHours = (clockIn: Date | string | null, clockOut: Date | string | null) => {
    if (!clockIn || !clockOut) return 'In Progress';
    const clockInTime = typeof clockIn === 'string' ? new Date(clockIn) : clockIn;
    const clockOutTime = typeof clockOut === 'string' ? new Date(clockOut) : clockOut;
    const diff = clockOutTime.getTime() - clockInTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(emp => emp.employeeCode === employeeId);
    return employee?.name || `Employee ${employeeId}`;
  };

  const getEmployeeById = (employeeId: string) => {
    return employees.find(emp => emp.employeeCode === employeeId);
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Time Clock Administration
          </CardTitle>
          <CardDescription>
            Manage employee time clock entries and punches
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Filters and Controls */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Employees</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by employee name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex-1">
              <Label htmlFor="employee">Filter by Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.employeeCode || employee.id.toString()}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <Label htmlFor="date">Filter by Date</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            
            <div className="flex items-end">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-500 hover:bg-blue-600">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Entry
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Time Entry</DialogTitle>
                    <DialogDescription>
                      Create a new time clock entry for an employee
                    </DialogDescription>
                  </DialogHeader>
                  <TimeEntryForm 
                    employees={employees}
                    onSubmit={(data) => createEntryMutation.mutate(data)}
                    isLoading={createEntryMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Time Entries Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No time entries found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {getEmployeeName(entry.employeeId)}
                      </TableCell>
                      <TableCell>{entry.date}</TableCell>
                      <TableCell>
                        {entry.clockIn ? format(new Date(entry.clockIn), 'h:mm a') : '-'}
                      </TableCell>
                      <TableCell>
                        {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
                      </TableCell>
                      <TableCell>
                        {calculateHours(entry.clockIn, entry.clockOut)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.clockOut ? 'secondary' : 'default'}>
                          {entry.clockOut ? 'Complete' : 'In Progress'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(entry)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              Modify the time clock entry details
            </DialogDescription>
          </DialogHeader>
          {editingEntry && (
            <TimeEntryForm 
              employees={employees}
              initialData={editingEntry}
              onSubmit={(data) => updateEntryMutation.mutate({ ...data, id: editingEntry.id })}
              isLoading={updateEntryMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Time Entry Form Component
interface TimeEntryFormProps {
  employees: Employee[];
  initialData?: TimeClockEntry;
  onSubmit: (data: Partial<TimeClockEntry>) => void;
  isLoading: boolean;
}

function TimeEntryForm({ employees, initialData, onSubmit, isLoading }: TimeEntryFormProps) {
  const [formData, setFormData] = useState({
    employeeId: initialData?.employeeId || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    clockIn: initialData?.clockIn ? new Date(initialData.clockIn).toISOString().slice(0, 16) : '',
    clockOut: initialData?.clockOut ? new Date(initialData.clockOut).toISOString().slice(0, 16) : ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      employeeId: formData.employeeId,
      date: formData.date,
      clockIn: formData.clockIn ? new Date(formData.clockIn) : null,
      clockOut: formData.clockOut ? new Date(formData.clockOut) : null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="employee">Employee</Label>
        <Select 
          value={formData.employeeId} 
          onValueChange={(value) => setFormData(prev => ({ ...prev, employeeId: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Employee" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((employee) => (
              <SelectItem key={employee.id} value={employee.employeeCode || employee.id.toString()}>
                {employee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="clockIn">Clock In Time</Label>
        <Input
          id="clockIn"
          type="datetime-local"
          value={formData.clockIn}
          onChange={(e) => setFormData(prev => ({ ...prev, clockIn: e.target.value }))}
        />
      </div>

      <div>
        <Label htmlFor="clockOut">Clock Out Time</Label>
        <Input
          id="clockOut"
          type="datetime-local"
          value={formData.clockOut}
          onChange={(e) => setFormData(prev => ({ ...prev, clockOut: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          disabled={isLoading || !formData.employeeId || !formData.date}
          className="bg-blue-500 hover:bg-blue-600"
        >
          {isLoading ? 'Saving...' : initialData ? 'Update Entry' : 'Create Entry'}
        </Button>
      </div>
    </form>
  );
}
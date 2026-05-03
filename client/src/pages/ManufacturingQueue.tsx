import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  MoreHorizontal,
  Plus,
  ArrowUpDown,
} from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';
import type { ManufacturingQueue, InsertManufacturingQueue } from '@shared/schema';

type QueueItemWithInventory = ManufacturingQueue & {
  inventoryItem: {
    id: number;
    agPartNumber: string | null;
    name: string;
    sku: string | null;
    type: string;
    manufacturingDepartment: string | null;
    notes: string | null;
  } | null;
};

export default function ManufacturingQueue() {
  const { toast } = useToast();
  const [selectedDepartment, setSelectedDepartment] = useState<string>('Cutting Table');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);


  // Fetch queue items
  const { data: queueItems = [], isLoading } = useQuery<QueueItemWithInventory[]>({
    queryKey: ['/api/manufacturing-queue', selectedDepartment, selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedDepartment) params.append('department', selectedDepartment);
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      return apiRequest(`/api/manufacturing-queue?${params.toString()}`);
    },
    enabled: true,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest(`/api/manufacturing-queue/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({
        title: 'Status updated',
        description: 'The queue item status has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/manufacturing-queue/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({
        title: 'Item deleted',
        description: 'The queue item has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this item from the queue?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><PlayCircle className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority <= 25) return 'text-red-600 dark:text-red-400 font-bold';
    if (priority <= 50) return 'text-orange-600 dark:text-orange-400 font-semibold';
    if (priority <= 75) return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  return (
    <div className="container mx-auto py-6 px-4 dark:bg-gray-950 dark:text-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 dark:text-white">Manufacturing Queue</h1>
          <p className="text-muted-foreground dark:text-gray-400">
            Track and manage items that need to be manufactured
          </p>
        </div>
        <AddQueueItemDialog 
          isOpen={isAddDialogOpen} 
          onOpenChange={setIsAddDialogOpen}
        />
      </div>

      <ReturnsRepairsSection repairDepartment="P1 Production Queue" />

      <Card className="dark:bg-gray-900 dark:border-gray-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div>
              <CardTitle className="dark:text-white">Queue Items</CardTitle>
              <CardDescription className="dark:text-gray-400">
                View and manage items in the manufacturing queue
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-[200px] dark:bg-gray-800 dark:border-gray-700 dark:text-white" data-testid="select-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="Cutting Table">Cutting Table</SelectItem>
                  <SelectItem value="CNC">CNC</SelectItem>
                  <SelectItem value="Cores">Cores</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[150px] dark:bg-gray-800 dark:border-gray-700 dark:text-white" data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground dark:text-gray-400">Loading queue items...</div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
              No items found in the queue for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-800">
                    <TableHead className="dark:text-gray-300">Priority</TableHead>
                    <TableHead className="dark:text-gray-300">Part Number</TableHead>
                    <TableHead className="dark:text-gray-300">Item Name</TableHead>
                    <TableHead className="dark:text-gray-300">Department</TableHead>
                    <TableHead className="dark:text-gray-300">Quantity</TableHead>
                    <TableHead className="dark:text-gray-300">Status</TableHead>
                    <TableHead className="dark:text-gray-300">Due Date</TableHead>
                    <TableHead className="dark:text-gray-300">Assigned To</TableHead>
                    <TableHead className="dark:text-gray-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.map((item) => (
                    <TableRow key={item.id} className="dark:border-gray-800" data-testid={`row-queue-${item.id}`}>
                      <TableCell className={getPriorityColor(item.priority || 50)}>
                        {item.priority || 50}
                      </TableCell>
                      <TableCell className="font-mono text-sm dark:text-gray-300">
                        {item.inventoryItem?.agPartNumber || '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">{item.inventoryItem?.name || 'Unknown'}</TableCell>
                      <TableCell className="dark:text-gray-300">{item.department}</TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className="font-semibold">{item.quantityCompleted || 0}</span> / {item.quantityRequested}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">{item.assignedTo || '-'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid={`button-actions-${item.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(item.id, 'IN_PROGRESS')}
                              disabled={item.status === 'IN_PROGRESS'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Mark In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(item.id, 'COMPLETED')}
                              disabled={item.status === 'COMPLETED'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Mark Completed
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(item.id, 'CANCELLED')}
                              disabled={item.status === 'CANCELLED'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Cancel
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(item.id)}
                              className="text-red-600 dark:text-red-400 dark:focus:bg-gray-700"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddQueueItemDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertManufacturingQueue>>({
    department: 'Cutting Table',
    quantityRequested: 1,
    priority: 50,
    status: 'PENDING',
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertManufacturingQueue) => {
      await apiRequest('/api/manufacturing-queue', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({
        title: 'Queue item added',
        description: 'The item has been added to the manufacturing queue.',
      });
      onOpenChange(false);
      setFormData({
        department: 'Cutting Table',
        quantityRequested: 1,
        priority: 50,
        status: 'PENDING',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add item to queue. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.inventoryItemId) {
      toast({
        title: 'Error',
        description: 'Please enter an inventory item ID.',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate(formData as InsertManufacturingQueue);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-queue-item">
          <Plus className="w-4 h-4 mr-2" />
          Add to Queue
        </Button>
      </DialogTrigger>
      <DialogContent className="dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Add Item to Manufacturing Queue</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Add a new item to the manufacturing queue
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="inventoryItemId" className="dark:text-gray-300">Inventory Item ID</Label>
            <Input
              id="inventoryItemId"
              type="number"
              value={formData.inventoryItemId || ''}
              onChange={(e) => setFormData({ ...formData, inventoryItemId: parseInt(e.target.value) })}
              required
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-inventory-item-id"
            />
          </div>
          <div>
            <Label htmlFor="department" className="dark:text-gray-300">Department</Label>
            <Select 
              value={formData.department} 
              onValueChange={(value) => setFormData({ ...formData, department: value })}
            >
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" data-testid="select-add-department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="Cutting Table">Cutting Table</SelectItem>
                <SelectItem value="CNC">CNC</SelectItem>
                <SelectItem value="Cores">Cores</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="quantityRequested" className="dark:text-gray-300">Quantity Requested</Label>
            <Input
              id="quantityRequested"
              type="number"
              min="1"
              value={formData.quantityRequested || 1}
              onChange={(e) => setFormData({ ...formData, quantityRequested: parseInt(e.target.value) })}
              required
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-quantity-requested"
            />
          </div>
          <div>
            <Label htmlFor="priority" className="dark:text-gray-300">Priority (1-100, lower = higher priority)</Label>
            <Input
              id="priority"
              type="number"
              min="1"
              max="100"
              value={formData.priority || 50}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-priority"
            />
          </div>
          <div>
            <Label htmlFor="dueDate" className="dark:text-gray-300">Due Date (optional)</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value ? new Date(e.target.value) : undefined })}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-due-date"
            />
          </div>
          <div>
            <Label htmlFor="assignedTo" className="dark:text-gray-300">Assigned To (optional)</Label>
            <Input
              id="assignedTo"
              value={formData.assignedTo || ''}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-assigned-to"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="dark:text-gray-300">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              data-testid="input-notes"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-queue-item">
              {createMutation.isPending ? 'Adding...' : 'Add to Queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Route,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InventoryItem {
  id: string;
  agPartNumber: string;
  name: string;
  type: string;
  manufacturingDepartment: string | null;
}

const AVAILABLE_DEPARTMENTS = [
  'Layup',
  'CNC',
  'Cutting Table',
  'Core Department',
  'Gunsmith',
  'Paint',
  'Finish QC',
  'Shipping QC',
];

const TRACEABILITY_FIELDS = [
  'Lot Number',
  'Batch Number',
  'Expiration Date',
  'Serial Number',
  'Revision',
];

export default function PartRoutingManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    routing: PartRouting | null;
  }>({ open: false, routing: null });
  const [viewDialog, setViewDialog] = useState<{
    open: boolean;
    routing: PartRouting | null;
  }>({ open: false, routing: null });
  
  // Form state for edit/create
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState('');
  const [departmentSequence, setDepartmentSequence] = useState<string[]>([]);
  const [traceabilityConfig, setTraceabilityConfig] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all part routings
  const { data: routings = [], isLoading } = useQuery<PartRouting[]>({
    queryKey: ['/api/part-routings'],
  });

  // Fetch all inventory items to show which parts don't have routings
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/part-routings', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Part routing created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
      handleCloseEditDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create part routing',
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/part-routings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Part routing updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
      handleCloseEditDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update part routing',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/part-routings/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Part routing deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete part routing',
        variant: 'destructive',
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/part-routings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Part routing status updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update part routing status',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this part routing?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleView = (routing: PartRouting) => {
    setViewDialog({ open: true, routing });
  };

  const handleOpenEditDialog = (routing: PartRouting | null) => {
    if (routing) {
      // Edit existing routing
      setSelectedInventoryItemId(routing.inventoryItemId);
      setDepartmentSequence([...routing.departmentSequence]);
      setTraceabilityConfig({ ...routing.traceabilityConfig });
      setNotes(routing.notes || '');
      setIsActive(routing.isActive);
    } else {
      // Create new routing
      setSelectedInventoryItemId('');
      setDepartmentSequence([]);
      setTraceabilityConfig({});
      setNotes('');
      setIsActive(true);
    }
    setEditDialog({ open: true, routing });
  };

  const handleCloseEditDialog = () => {
    setEditDialog({ open: false, routing: null });
    setSelectedInventoryItemId('');
    setDepartmentSequence([]);
    setTraceabilityConfig({});
    setNotes('');
    setIsActive(true);
  };

  const handleSaveRouting = () => {
    if (!selectedInventoryItemId) {
      toast({
        title: 'Validation Error',
        description: 'Please select an inventory item',
        variant: 'destructive',
      });
      return;
    }

    if (departmentSequence.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one department to the sequence',
        variant: 'destructive',
      });
      return;
    }

    const selectedItem = inventoryItems.find(item => item.id === selectedInventoryItemId);
    if (!selectedItem) return;

    const routingData = {
      inventoryItemId: selectedInventoryItemId,
      partNumber: selectedItem.agPartNumber,
      partName: selectedItem.name,
      departmentSequence,
      traceabilityConfig,
      isActive,
      notes: notes || null,
    };

    if (editDialog.routing) {
      // Update existing
      updateMutation.mutate({ id: editDialog.routing.id, data: routingData });
    } else {
      // Create new
      createMutation.mutate(routingData);
    }
  };

  const handleAddDepartment = (dept: string) => {
    if (!departmentSequence.includes(dept)) {
      setDepartmentSequence([...departmentSequence, dept]);
    }
  };

  const handleRemoveDepartment = (index: number) => {
    const newSequence = [...departmentSequence];
    newSequence.splice(index, 1);
    setDepartmentSequence(newSequence);
  };

  const handleMoveDepartment = (index: number, direction: 'up' | 'down') => {
    const newSequence = [...departmentSequence];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSequence[index], newSequence[targetIndex]] = [newSequence[targetIndex], newSequence[index]];
    setDepartmentSequence(newSequence);
  };

  const handleToggleTraceabilityField = (dept: string, field: string) => {
    const currentFields = traceabilityConfig[dept] || [];
    const newFields = currentFields.includes(field)
      ? currentFields.filter(f => f !== field)
      : [...currentFields, field];
    
    if (newFields.length === 0) {
      const newConfig = { ...traceabilityConfig };
      delete newConfig[dept];
      setTraceabilityConfig(newConfig);
    } else {
      setTraceabilityConfig({
        ...traceabilityConfig,
        [dept]: newFields,
      });
    }
  };

  // Filter routings based on search and active status
  const filteredRoutings = routings.filter((routing) => {
    const matchesSearch =
      routing.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      routing.partName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterActive === 'all' ||
      (filterActive === 'active' && routing.isActive) ||
      (filterActive === 'inactive' && !routing.isActive);

    return matchesSearch && matchesFilter;
  });

  // Find inventory items without routings
  const itemsWithoutRoutings = inventoryItems.filter(
    (item) =>
      item.type === 'manufactured' &&
      !routings.some((r) => r.partNumber === item.agPartNumber)
  );

  // Get available inventory items for selection (manufactured only, not already routed)
  const availableItems = inventoryItems.filter(
    (item) =>
      item.type === 'manufactured' &&
      (editDialog.routing 
        ? item.id === editDialog.routing.inventoryItemId || !routings.some((r) => r.inventoryItemId === item.id)
        : !routings.some((r) => r.inventoryItemId === item.id))
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading part routings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Route className="h-8 w-8" />
            Part Routing Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure department sequences and traceability requirements for manufactured parts
          </p>
        </div>
        <Button onClick={() => handleOpenEditDialog(null)} data-testid="button-create-routing">
          <Plus className="h-4 w-4 mr-2" />
          Create Routing
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Routings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{routings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Routings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {routings.filter((r) => r.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Parts Without Routing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {itemsWithoutRoutings.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by part number or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-routing"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterActive === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterActive('all')}
                data-testid="button-filter-all"
              >
                All
              </Button>
              <Button
                variant={filterActive === 'active' ? 'default' : 'outline'}
                onClick={() => setFilterActive('active')}
                data-testid="button-filter-active"
              >
                Active
              </Button>
              <Button
                variant={filterActive === 'inactive' ? 'default' : 'outline'}
                onClick={() => setFilterActive('inactive')}
                data-testid="button-filter-inactive"
              >
                Inactive
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRoutings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Settings className="h-12 w-12 mb-2" />
              <p>No part routings found</p>
              <p className="text-sm">Create a routing to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Department Sequence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutings.map((routing) => (
                  <TableRow key={routing.id}>
                    <TableCell className="font-medium">
                      {routing.partNumber}
                    </TableCell>
                    <TableCell>{routing.partName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {routing.departmentSequence.map((dept, idx) => (
                          <Badge key={idx} variant="outline">
                            {dept}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={routing.isActive ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => handleToggleActive(routing.id, routing.isActive)}
                      >
                        {routing.isActive ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {routing.notes ? (
                        <span className="text-sm text-muted-foreground truncate max-w-xs block">
                          {routing.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleView(routing)}
                          data-testid={`button-view-${routing.id}`}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditDialog(routing)}
                          data-testid={`button-edit-${routing.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(routing.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${routing.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Parts Without Routings */}
      {itemsWithoutRoutings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Manufactured Parts Without Routing Configuration</CardTitle>
            <CardDescription>
              These parts are set as "manufactured" but don't have department routing configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Manufacturing Department</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsWithoutRoutings.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.agPartNumber}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      {item.manufacturingDepartment ? (
                        <Badge variant="outline">{item.manufacturingDepartment}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedInventoryItemId(item.id);
                          setDepartmentSequence(item.manufacturingDepartment ? [item.manufacturingDepartment] : []);
                          setTraceabilityConfig({});
                          setNotes('');
                          setIsActive(true);
                          setEditDialog({ open: true, routing: null });
                        }}
                        data-testid={`button-create-routing-${item.id}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create Routing
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {itemsWithoutRoutings.length > 10 && (
              <p className="text-sm text-muted-foreground mt-2">
                ...and {itemsWithoutRoutings.length - 10} more parts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && handleCloseEditDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editDialog.routing ? 'Edit Part Routing' : 'Create Part Routing'}
            </DialogTitle>
            <DialogDescription>
              Configure department sequence and traceability requirements for manufactured parts
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Part Selection */}
            <div className="space-y-2">
              <Label htmlFor="part-select">Select Part *</Label>
              <Select value={selectedInventoryItemId} onValueChange={setSelectedInventoryItemId} disabled={!!editDialog.routing}>
                <SelectTrigger id="part-select">
                  <SelectValue placeholder="Select a manufactured part..." />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.agPartNumber} - {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only manufactured parts without existing routing are shown
              </p>
            </div>

            {/* Department Sequence Builder */}
            <div className="space-y-2">
              <Label>Department Sequence *</Label>
              <div className="flex gap-2">
                <Select onValueChange={handleAddDepartment}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_DEPARTMENTS.filter(d => !departmentSequence.includes(d)).map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {departmentSequence.length > 0 && (
                <div className="space-y-2 mt-2">
                  {departmentSequence.map((dept, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border rounded">
                      <Badge variant="outline" className="flex-1">
                        {index + 1}. {dept}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveDepartment(index, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveDepartment(index, 'down')}
                          disabled={index === departmentSequence.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDepartment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Traceability Configuration */}
            {departmentSequence.length > 0 && (
              <div className="space-y-2">
                <Label>Traceability Requirements (Optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Select which traceability fields are required for each department
                </p>
                <div className="space-y-3">
                  {departmentSequence.map((dept) => (
                    <div key={dept} className="border rounded p-3">
                      <div className="font-semibold text-sm mb-2">{dept}</div>
                      <div className="flex flex-wrap gap-2">
                        {TRACEABILITY_FIELDS.map((field) => (
                          <Badge
                            key={field}
                            variant={(traceabilityConfig[dept] || []).includes(field) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => handleToggleTraceabilityField(dept, field)}
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes or instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active routing (enable this routing for production use)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRouting}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-routing"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editDialog.routing
                  ? 'Update Routing'
                  : 'Create Routing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog
        open={viewDialog.open}
        onOpenChange={(open) => setViewDialog({ open, routing: null })}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Part Routing Details</DialogTitle>
            <DialogDescription>
              {viewDialog.routing?.partNumber} - {viewDialog.routing?.partName}
            </DialogDescription>
          </DialogHeader>
          {viewDialog.routing && (
            <div className="space-y-4">
              <div>
                <Label>Department Sequence</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {viewDialog.routing.departmentSequence.map((dept, idx) => (
                    <Badge key={idx} variant="outline" className="text-base px-3 py-1">
                      {idx + 1}. {dept}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Traceability Configuration</Label>
                <div className="mt-2 space-y-2">
                  {Object.entries(viewDialog.routing.traceabilityConfig).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No traceability requirements configured</p>
                  ) : (
                    Object.entries(viewDialog.routing.traceabilityConfig).map(([dept, fields]) => (
                      <div key={dept} className="border rounded p-3">
                        <div className="font-semibold text-sm mb-2">{dept}</div>
                        <div className="flex flex-wrap gap-1">
                          {fields.map((field, idx) => (
                            <Badge key={idx} variant="secondary">{field}</Badge>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {viewDialog.routing.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm mt-1">{viewDialog.routing.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <Label>Created</Label>
                  <p>{new Date(viewDialog.routing.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <Label>Last Updated</Label>
                  <p>{new Date(viewDialog.routing.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

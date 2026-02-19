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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Route,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  Eye,
  Users,
  Package,
  Flame,
} from 'lucide-react';
import PartRoutingWizard from '@/components/PartRoutingWizard';

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[];
  entryMethod: 'manual' | 'barcode';
}

interface QCStandard {
  standard: string;
  tolerance: string;
  requirement: string;
  referenceLink?: string;
}

interface OvenCuringStep {
  temperature: string;
  time: string;
}

interface CustomDataField {
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'textarea';
  isRequired: boolean;
}

interface DepartmentConfiguration {
  materials: MaterialRequirement[];
  assignedTechnicianId: number | null;
  qcStandards: QCStandard[];
  ovenCuringSteps?: OvenCuringStep[];
  specialProcess?: string;
  customDataFields?: CustomDataField[];
}

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>;
  departmentMaterials?: Record<string, MaterialRequirement[]>;
  departmentConfig?: Record<string, DepartmentConfiguration>;
  isActive?: boolean;
  notes?: string | null;
  createdBy: string;
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

export default function PartRoutingManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [editRouting, setEditRouting] = useState<PartRouting | null>(null);
  const [viewDialog, setViewDialog] = useState<{
    open: boolean;
    routing: PartRouting | null;
  }>({ open: false, routing: null });
  
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

  const handleOpenWizard = (routing: PartRouting | null) => {
    setEditRouting(routing);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditRouting(null);
    queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
  };

  // Filter routings based on search and active status
  const filteredRoutings = routings.filter((routing) => {
    const matchesSearch =
      routing.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      routing.partName.toLowerCase().includes(searchTerm.toLowerCase());

    const isActive = routing.isActive !== false;
    const matchesFilter =
      filterActive === 'all' ||
      (filterActive === 'active' && isActive) ||
      (filterActive === 'inactive' && !isActive);

    return matchesSearch && matchesFilter;
  });

  // Find inventory items without routings
  const itemsWithoutRoutings = inventoryItems.filter(
    (item) =>
      item.type === 'manufactured' &&
      !routings.some((r) => r.partNumber === item.agPartNumber)
  );

  // Count routings with full configuration
  const routingsWithConfig = routings.filter(r => r.departmentConfig && Object.keys(r.departmentConfig).length > 0).length;
  const activeRoutings = routings.filter(r => r.isActive !== false).length;

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
            Configure department sequences, materials, technicians, and traceability requirements for manufactured parts
          </p>
        </div>
        <Button onClick={() => handleOpenWizard(null)} data-testid="button-create-routing">
          <Plus className="h-4 w-4 mr-2" />
          Create Routing
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              {activeRoutings}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Fully Configured</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {routingsWithConfig}
            </div>
            <p className="text-xs text-muted-foreground">With materials/technicians</p>
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
                  <TableHead>Configuration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutings.map((routing) => {
                  const hasConfig = routing.departmentConfig && Object.keys(routing.departmentConfig).length > 0;
                  const hasMaterials = hasConfig && Object.values(routing.departmentConfig || {}).some(
                    (cfg) => cfg.materials && cfg.materials.length > 0
                  );
                  const hasTechnicians = hasConfig && Object.values(routing.departmentConfig || {}).some(
                    (cfg) => cfg.assignedTechnicianId !== null
                  );
                  const hasOvenCuring = hasConfig && Object.values(routing.departmentConfig || {}).some(
                    (cfg) => cfg.ovenCuringSteps && cfg.ovenCuringSteps.length > 0
                  );
                  const isActive = routing.isActive !== false;
                  
                  return (
                    <TableRow key={routing.id}>
                      <TableCell className="font-medium">
                        {routing.partNumber}
                      </TableCell>
                      <TableCell>{routing.partName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {routing.departmentSequence.map((dept, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {dept}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasMaterials && (
                            <Badge variant="secondary" className="text-xs" title="Has materials configured">
                              <Package className="h-3 w-3" />
                            </Badge>
                          )}
                          {hasTechnicians && (
                            <Badge variant="secondary" className="text-xs" title="Has preferred technician (any certified tech can work)">
                              <Users className="h-3 w-3" />
                            </Badge>
                          )}
                          {hasOvenCuring && (
                            <Badge variant="secondary" className="text-xs" title="Has oven curing steps">
                              <Flame className="h-3 w-3" />
                            </Badge>
                          )}
                          {!hasConfig && (
                            <span className="text-xs text-muted-foreground">Basic</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isActive ? 'default' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => handleToggleActive(routing.id, isActive)}
                        >
                          {isActive ? (
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
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleView(routing)}
                            data-testid={`button-view-${routing.id}`}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenWizard(routing)}
                            data-testid={`button-edit-${routing.id}`}
                            title="Edit routing"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(routing.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${routing.id}`}
                            title="Delete routing"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
                        onClick={() => handleOpenWizard(null)}
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

      {/* Part Routing Wizard - Uses the same component as P2 Department Manager */}
      <PartRoutingWizard
        open={showWizard}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseWizard();
          }
        }}
        editRouting={editRouting}
      />

      {/* View Dialog - Displays detailed routing info */}
      <Dialog
        open={viewDialog.open}
        onOpenChange={(open) => setViewDialog({ open, routing: null })}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Part Routing Details</DialogTitle>
            <DialogDescription>
              {viewDialog.routing?.partNumber} - {viewDialog.routing?.partName}
            </DialogDescription>
          </DialogHeader>
          {viewDialog.routing && (
            <div className="space-y-6">
              {/* Department Sequence */}
              <div>
                <Label className="text-base font-semibold">Department Sequence</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {viewDialog.routing.departmentSequence.map((dept, idx) => (
                    <Badge key={idx} variant="outline" className="text-base px-3 py-1">
                      {idx + 1}. {dept}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Department Configuration Details */}
              {viewDialog.routing.departmentConfig && Object.keys(viewDialog.routing.departmentConfig).length > 0 && (
                <div>
                  <Label className="text-base font-semibold">Department Configuration</Label>
                  <div className="mt-2 space-y-3">
                    {viewDialog.routing.departmentSequence.map((dept) => {
                      const config = viewDialog.routing?.departmentConfig?.[dept];
                      if (!config) return null;
                      
                      return (
                        <Card key={dept} className="p-3">
                          <div className="font-semibold text-sm mb-2">{dept}</div>
                          <div className="space-y-2 text-sm">
                            {config.materials && config.materials.length > 0 && (
                              <div className="flex items-start gap-2">
                                <Package className="h-4 w-4 text-blue-600 mt-0.5" />
                                <div>
                                  <span className="font-medium">Materials:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {config.materials.map((mat, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {mat.partNumber} - {mat.partName}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            {config.assignedTechnicianId && (
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-green-600" />
                                <span className="font-medium">Preferred Technician ID:</span> {config.assignedTechnicianId}
                                <span className="text-xs text-muted-foreground">(optional - any certified tech can work)</span>
                              </div>
                            )}
                            {config.ovenCuringSteps && config.ovenCuringSteps.length > 0 && (
                              <div className="flex items-start gap-2">
                                <Flame className="h-4 w-4 text-orange-600 mt-0.5" />
                                <div>
                                  <span className="font-medium">Oven Curing:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {config.ovenCuringSteps.map((step, idx) => (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {step.temperature} for {step.time}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            {config.qcStandards && config.qcStandards.length > 0 && (
                              <div>
                                <span className="font-medium">QC Standards:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {config.qcStandards.map((std, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {std.standard}: {std.tolerance}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {config.customDataFields && config.customDataFields.length > 0 && (
                              <div>
                                <span className="font-medium">Custom Data Fields:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {config.customDataFields.map((field, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {field.fieldName} ({field.fieldType})
                                      {field.isRequired && ' *'}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {config.specialProcess && (
                              <div>
                                <span className="font-medium">Special Process:</span> {config.specialProcess}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Traceability Configuration */}
              <div>
                <Label className="text-base font-semibold">Traceability Configuration</Label>
                <div className="mt-2 space-y-2">
                  {Object.entries(viewDialog.routing.traceabilityConfig || {}).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No item-level traceability requirements configured</p>
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

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground border-t pt-4">
                <div>
                  <Label>Created</Label>
                  <p>{new Date(viewDialog.routing.createdAt).toLocaleString()}</p>
                  {viewDialog.routing.createdBy && (
                    <p className="text-xs">by {viewDialog.routing.createdBy}</p>
                  )}
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

import { useState } from 'react';
import { Link } from 'wouter';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  List,
  BookTemplate,
  GitBranch,
  AlertTriangle,
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
  routingType?: string;
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

interface RoutingDependency {
  id: number;
  partRoutingId: string;
  dependencyType: string;
  requiredItemId: number | null;
  requiredPartNumber: string | null;
  requiredDescription: string | null;
  requiredQty: number | null;
  isSerialized: boolean | null;
  mustBeCompleted: boolean | null;
  mustBeAllocated: boolean | null;
  mustBeScanned: boolean | null;
  mustBeIssued: boolean | null;
  mustBeScannedToParent: boolean | null;
  blockingScope: string;
  routingOperationId: number | null;
  appliesToDepartment: string | null;
  appliesToOperationId: number | null;
  notes: string | null;
}

interface DependencyStatus {
  dependencyId: number;
  dependencyType: string;
  requiredPartNumber: string | null;
  requiredDescription: string | null;
  requiredQty: number | null;
  blockingScope: string;
  satisfied: boolean;
  reason: string;
  availableQty?: number;
}

interface AssemblyReadinessResult {
  ready: boolean;
  totalDependencies: number;
  satisfiedCount: number;
  blockingCount: number;
  completionPct: number;
  blockingItems: DependencyStatus[];
  satisfiedItems: DependencyStatus[];
  warnings: string[];
}

interface InventoryItem {
  id: string;
  agPartNumber: string;
  name: string;
  type: string;
  manufacturingDepartment: string | null;
}

interface RoutingOperation {
  id: number;
  partRoutingId: string;
  stepNumber: number;
  departmentName: string;
  operationName: string;
  operationType: 'SETUP' | 'RUN' | 'INSPECT' | 'OSP' | 'MATERIAL' | 'QC';
  workCenter: string | null;
  estimatedMinutes: number | null;
  requiresSignature: boolean;
  requiresCertification: boolean;
  isOutsideProcess: boolean;
  vendorId: number | null;
  instructionPack: Record<string, unknown>;
  createdAt: string;
}

const OPERATION_TYPES = ['SETUP', 'RUN', 'INSPECT', 'OSP', 'MATERIAL', 'QC'] as const;

const emptyNewOp = {
  stepNumber: 1,
  departmentName: '',
  operationName: '',
  operationType: 'RUN' as RoutingOperation['operationType'],
  workCenter: '',
  estimatedMinutes: '' as unknown as number,
  requiresSignature: false,
  requiresCertification: false,
};

export default function PartRoutingManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [editRouting, setEditRouting] = useState<PartRouting | null>(null);
  const [viewDialog, setViewDialog] = useState<{
    open: boolean;
    routing: PartRouting | null;
  }>({ open: false, routing: null });
  const [operationsDialog, setOperationsDialog] = useState<{
    open: boolean;
    routing: PartRouting | null;
  }>({ open: false, routing: null });
  const [newOp, setNewOp] = useState({ ...emptyNewOp });
  const [depsDialog, setDepsDialog] = useState<{ open: boolean; routing: PartRouting | null }>({ open: false, routing: null });
  const [newDep, setNewDep] = useState({
    dependencyType: 'CHILD_PART',
    requiredPartNumber: '',
    requiredDescription: '',
    requiredQty: '',
    blockingScope: 'TRAVELER_START',
    mustBeCompleted: true,
    mustBeIssued: false,
    mustBeScannedToParent: false,
    notes: '',
  });

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

  // Fetch routing operations when operations dialog is open
  const { data: operations = [], isLoading: opsLoading } = useQuery<RoutingOperation[]>({
    queryKey: ['/api/part-routings', operationsDialog.routing?.id, 'operations'],
    enabled: operationsDialog.open && !!operationsDialog.routing?.id,
  });

  // Create routing operation
  const createOpMutation = useMutation({
    mutationFn: (data: typeof newOp) =>
      apiRequest(`/api/part-routings/${operationsDialog.routing?.id}/operations`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Operation added' });
      setNewOp({ ...emptyNewOp });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', operationsDialog.routing?.id, 'operations'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Delete routing operation
  const deleteOpMutation = useMutation({
    mutationFn: (opId: number) =>
      apiRequest(`/api/part-routings/${operationsDialog.routing?.id}/operations/${opId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({ title: 'Operation deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', operationsDialog.routing?.id, 'operations'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
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

  // Fetch dependencies when deps dialog is open
  const { data: currentDeps = [], isLoading: depsLoading } = useQuery<RoutingDependency[]>({
    queryKey: ['/api/part-routings', depsDialog.routing?.id, 'dependencies'],
    enabled: depsDialog.open && !!depsDialog.routing?.id,
  });

  // Fetch assembly readiness when deps dialog is open
  const { data: readiness, isLoading: readinessLoading, refetch: refetchReadiness } = useQuery<AssemblyReadinessResult>({
    queryKey: ['/api/part-routings', depsDialog.routing?.id, 'assembly-readiness'],
    enabled: depsDialog.open && !!depsDialog.routing?.id,
  });

  const createDepMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest(`/api/part-routings/${depsDialog.routing?.id}/dependencies`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', depsDialog.routing?.id, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', depsDialog.routing?.id, 'assembly-readiness'] });
      setNewDep({ dependencyType: 'CHILD_PART', requiredPartNumber: '', requiredDescription: '', requiredQty: '', blockingScope: 'TRAVELER_START', mustBeCompleted: true, notes: '' });
      toast({ title: 'Dependency added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteDepMutation = useMutation({
    mutationFn: (depId: number) =>
      apiRequest(`/api/part-routings/${depsDialog.routing?.id}/dependencies/${depId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', depsDialog.routing?.id, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings', depsDialog.routing?.id, 'assembly-readiness'] });
      toast({ title: 'Dependency removed' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleAddDep = () => {
    if (!newDep.dependencyType || !depsDialog.routing?.id) return;
    const payload: Record<string, unknown> = {
      partRoutingId: depsDialog.routing.id,
      dependencyType: newDep.dependencyType,
      blockingScope: newDep.blockingScope,
      mustBeCompleted: newDep.mustBeCompleted,
      mustBeIssued: newDep.mustBeIssued,
      mustBeScannedToParent: newDep.mustBeScannedToParent,
    };
    if (newDep.requiredPartNumber) payload.requiredPartNumber = newDep.requiredPartNumber;
    if (newDep.requiredDescription) payload.requiredDescription = newDep.requiredDescription;
    if (newDep.requiredQty) payload.requiredQty = parseInt(newDep.requiredQty);
    if (newDep.notes) payload.notes = newDep.notes;
    createDepMutation.mutate(payload);
  };

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
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/routing-templates">
              <BookTemplate className="h-4 w-4 mr-2" />
              Templates
            </Link>
          </Button>
          <Button onClick={() => handleOpenWizard(null)} data-testid="button-create-routing">
            <Plus className="h-4 w-4 mr-2" />
            Create Routing
          </Button>
        </div>
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
                            onClick={() => {
                              setNewOp({ ...emptyNewOp });
                              setOperationsDialog({ open: true, routing });
                            }}
                            title="Manage operations"
                          >
                            <List className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDepsDialog({ open: true, routing })}
                            title="Assembly dependencies"
                          >
                            <GitBranch className="h-4 w-4" />
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

      {/* Operations Management Dialog */}
      <Dialog
        open={operationsDialog.open}
        onOpenChange={(open) => {
          if (!open) setOperationsDialog({ open: false, routing: null });
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Routing Operations
            </DialogTitle>
            <DialogDescription>
              {operationsDialog.routing?.partNumber} — {operationsDialog.routing?.partName}
              <span className="ml-2 text-xs text-muted-foreground">(step-by-step operations for this routing)</span>
            </DialogDescription>
          </DialogHeader>

          {/* Existing Operations */}
          <div className="space-y-3">
            {opsLoading ? (
              <p className="text-sm text-muted-foreground">Loading operations...</p>
            ) : operations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                No operations defined yet. Add operations below to enable structured traveler generation.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Step</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Work Center</TableHead>
                    <TableHead className="w-16">Min</TableHead>
                    <TableHead className="w-24">Flags</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-mono text-sm">{op.stepNumber}</TableCell>
                      <TableCell className="font-medium">{op.departmentName}</TableCell>
                      <TableCell>{op.operationName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{op.operationType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{op.workCenter || '—'}</TableCell>
                      <TableCell className="text-sm">{op.estimatedMinutes ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {op.requiresSignature && <Badge variant="secondary" className="text-xs px-1">Sig</Badge>}
                          {op.requiresCertification && <Badge variant="secondary" className="text-xs px-1">Cert</Badge>}
                          {op.isOutsideProcess && <Badge variant="outline" className="text-xs px-1">OSP</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteOpMutation.mutate(op.id)}
                          disabled={deleteOpMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Add Operation Form */}
          <div className="border rounded-md p-4 space-y-3 mt-4">
            <Label className="text-sm font-semibold">Add Operation</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Step #</Label>
                <Input
                  type="number"
                  min={1}
                  value={newOp.stepNumber}
                  onChange={(e) => setNewOp((p) => ({ ...p, stepNumber: parseInt(e.target.value, 10) || 1 }))}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Department</Label>
                <Input
                  placeholder="e.g. Layup"
                  value={newOp.departmentName}
                  onChange={(e) => setNewOp((p) => ({ ...p, departmentName: e.target.value }))}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Operation Name</Label>
                <Input
                  placeholder="e.g. Load Program"
                  value={newOp.operationName}
                  onChange={(e) => setNewOp((p) => ({ ...p, operationName: e.target.value }))}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Operation Type</Label>
                <Select
                  value={newOp.operationType}
                  onValueChange={(v) => setNewOp((p) => ({ ...p, operationType: v as RoutingOperation['operationType'] }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Work Center (optional)</Label>
                <Input
                  placeholder="e.g. CNC-01"
                  value={newOp.workCenter}
                  onChange={(e) => setNewOp((p) => ({ ...p, workCenter: e.target.value }))}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Est. Minutes (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="30"
                  value={newOp.estimatedMinutes || ''}
                  onChange={(e) => setNewOp((p) => ({ ...p, estimatedMinutes: parseInt(e.target.value, 10) || ('' as unknown as number) }))}
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newOp.requiresSignature}
                  onChange={(e) => setNewOp((p) => ({ ...p, requiresSignature: e.target.checked }))}
                />
                Requires Signature
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newOp.requiresCertification}
                  onChange={(e) => setNewOp((p) => ({ ...p, requiresCertification: e.target.checked }))}
                />
                Requires Certification
              </label>
            </div>
            <Button
              size="sm"
              disabled={!newOp.departmentName.trim() || !newOp.operationName.trim() || createOpMutation.isPending}
              onClick={() => createOpMutation.mutate(newOp)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {createOpMutation.isPending ? 'Adding...' : 'Add Operation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assembly Dependencies Dialog */}
      <Dialog open={depsDialog.open} onOpenChange={(open) => { if (!open) setDepsDialog({ open: false, routing: null }); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Assembly Dependencies — {depsDialog.routing?.partNumber}
            </DialogTitle>
            <DialogDescription>
              Define required child parts, materials, and prerequisites for this routing. Used to gate assembly execution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Assembly Readiness Status */}
            {depsDialog.open && (
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Assembly Readiness</Label>
                  <Button size="sm" variant="ghost" onClick={() => refetchReadiness()}>Refresh</Button>
                </div>
                {readinessLoading ? (
                  <p className="text-sm text-muted-foreground">Evaluating…</p>
                ) : readiness ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {readiness.ready ? (
                        <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" />Ready
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />Blocked
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {readiness.satisfiedCount}/{readiness.totalDependencies} satisfied ({readiness.completionPct}%)
                      </span>
                    </div>
                    {readiness.blockingItems.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-red-600">Blocking:</p>
                        {readiness.blockingItems.map((item) => (
                          <p key={item.dependencyId} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                            [{item.dependencyType}] {item.requiredPartNumber || item.requiredDescription || 'Unnamed'} — {item.reason}
                          </p>
                        ))}
                      </div>
                    )}
                    {readiness.satisfiedItems.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-green-600">Satisfied:</p>
                        {readiness.satisfiedItems.map((item) => (
                          <p key={item.dependencyId} className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                            [{item.dependencyType}] {item.requiredPartNumber || item.requiredDescription || 'Unnamed'} — {item.reason}
                          </p>
                        ))}
                      </div>
                    )}
                    {readiness.warnings.length > 0 && (
                      <div className="space-y-1">
                        {readiness.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />{w}
                          </p>
                        ))}
                      </div>
                    )}
                    {readiness.totalDependencies === 0 && (
                      <p className="text-xs text-muted-foreground">No dependencies defined — routing can proceed unconditionally.</p>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Current Dependencies List */}
            {depsLoading ? (
              <p className="text-sm text-muted-foreground">Loading dependencies…</p>
            ) : currentDeps.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Part / Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Gates</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentDeps.map((dep) => (
                    <TableRow key={dep.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{dep.dependencyType.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {dep.requiredPartNumber && <p className="font-medium">{dep.requiredPartNumber}</p>}
                        {dep.requiredDescription && <p className="text-muted-foreground">{dep.requiredDescription}</p>}
                        {dep.notes && <p className="text-xs text-muted-foreground italic">{dep.notes}</p>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{dep.requiredQty ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{dep.blockingScope?.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {dep.mustBeCompleted && <span className="text-xs text-green-700 bg-green-50 rounded px-1">complete</span>}
                          {dep.mustBeIssued && <span className="text-xs text-blue-700 bg-blue-50 rounded px-1">issued</span>}
                          {dep.mustBeScannedToParent && <span className="text-xs text-amber-700 bg-amber-50 rounded px-1">scan</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-6 w-6 p-0"
                          onClick={() => deleteDepMutation.mutate(dep.id)}
                          disabled={deleteDepMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">No dependencies defined yet.</p>
            )}

            {/* Add Dependency Form */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/20">
              <p className="text-sm font-medium">Add Dependency</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={newDep.dependencyType} onValueChange={(v) => setNewDep(d => ({ ...d, dependencyType: v }))}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['CHILD_PART', 'SUB_ASSEMBLY', 'KIT', 'MATERIAL', 'TRAVELER', 'DOCUMENT', 'CERTIFICATION'].map(t => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Blocking Scope</Label>
                  <Select value={newDep.blockingScope} onValueChange={(v) => setNewDep(d => ({ ...d, blockingScope: v }))}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRAVELER_START">Traveler Start</SelectItem>
                      <SelectItem value="STEP_START">Step Start</SelectItem>
                      <SelectItem value="TASK_COMPLETE">Task Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Required Part Number</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="e.g. PN-001"
                    value={newDep.requiredPartNumber}
                    onChange={(e) => setNewDep(d => ({ ...d, requiredPartNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Required Qty</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    type="number"
                    min={1}
                    placeholder="1"
                    value={newDep.requiredQty}
                    onChange={(e) => setNewDep(d => ({ ...d, requiredQty: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Description / Notes</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Optional description"
                    value={newDep.requiredDescription}
                    onChange={(e) => setNewDep(d => ({ ...d, requiredDescription: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDep.mustBeCompleted}
                    onChange={(e) => setNewDep(d => ({ ...d, mustBeCompleted: e.target.checked }))}
                    className="h-3 w-3"
                  />
                  Must be completed
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDep.mustBeIssued}
                    onChange={(e) => setNewDep(d => ({ ...d, mustBeIssued: e.target.checked }))}
                    className="h-3 w-3"
                  />
                  Must be issued
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDep.mustBeScannedToParent}
                    onChange={(e) => setNewDep(d => ({ ...d, mustBeScannedToParent: e.target.checked }))}
                    className="h-3 w-3"
                  />
                  Scan to parent
                </label>
                <Button
                  size="sm"
                  onClick={handleAddDep}
                  disabled={createDepMutation.isPending}
                  className="ml-auto"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

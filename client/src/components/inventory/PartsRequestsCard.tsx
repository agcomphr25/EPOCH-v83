import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Calendar,
  User,
  Package,
  Factory,
  FolderOpen,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { InventoryItem, PartsRequest } from '@shared/schema';

import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface PartsRequestFormData {
  agPartNumber: string;
  partNumber: string;
  partName: string;
  requestedBy: string;
  requestedForEmployeeId: string;
  productionLine: string;
  projectId: string;
  department: string;
  quantity: string;
  urgency: string;
  vendorId: string;
  supplier: string;
  estimatedCost: string;
  reason: string;
  status: string;
  expectedDelivery: string;
  notes: string;
  approvalSignature: string;
}

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  status?: string;
}

interface DepartmentOption {
  id: number;
  name: string;
}

interface EmployeeOption {
  id: number;
  name: string;
  department?: string | null;
  isActive?: boolean | null;
}

type PartsRequestWithProject = PartsRequest & {
  requestedForEmployeeId?: number | null;
  requestedForDisplayName?: string | null;
  project?: {
    id: string | null;
    projectCode: string | null;
    projectName: string | null;
  };
  vendorPO?: {
    id: number | null;
    poNumber: string | null;
    externalPoNumber: string | null;
    status: string | null;
  };
};

const NONE_VALUE = '__none__';

interface SessionUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

function getDefaultRequestor(user: SessionUser | null | undefined): string {
  if (!user) return '';
  const fullName = [user.firstName, user.lastName]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join(' ')
    .trim();
  return user.username || fullName || '';
}

export default function PartsRequestsCard() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPartSelectOpen, setIsPartSelectOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PartsRequest | null>(
    null
  );
  const requestedByEditedRef = useRef(false);
  const initialProjectId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('projectId') || '';
  }, []);
  const openCreateFromQuery = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('create') === '1';
  }, []);

  const { data: sessionUser } = useQuery<SessionUser | null>({
    queryKey: ['/api/auth/session'],
  });
  const defaultRequestor = getDefaultRequestor(sessionUser);

  const [formData, setFormData] = useState<PartsRequestFormData>({
    agPartNumber: '',
    partNumber: '',
    partName: '',
    requestedBy: '',
    requestedForEmployeeId: '',
    productionLine: '',
    projectId: initialProjectId,
    department: '',
    quantity: '',
    urgency: 'MEDIUM',
    vendorId: '',
    supplier: '',
    estimatedCost: '',
    reason: '',
    status: 'PENDING',
    expectedDelivery: '',
    notes: '',
    approvalSignature: '',
  });

  // Load parts requests
  const { data: requests = [], isLoading } = useQuery<PartsRequestWithProject[]>({
    queryKey: ['/api/inventory/parts-requests'],
    queryFn: () => apiRequest('/api/inventory/parts-requests'),
  });

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
    queryFn: () => apiRequest('/api/projects'),
  });

  const { data: departments = [] } = useQuery<DepartmentOption[]>({
    queryKey: ['/api/inventory/departments'],
    queryFn: () => apiRequest('/api/inventory/departments'),
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
    queryFn: () => apiRequest('/api/employees'),
  });

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  const { data: inventoryItems = [], isLoading: isLoadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiRequest('/api/inventory'),
  });

  const activeInventoryItems = useMemo(
    () =>
      inventoryItems
        .filter((item) => item.isActive !== false)
        .sort((a, b) =>
          String(a.agPartNumber || '').localeCompare(String(b.agPartNumber || ''))
        ),
    [inventoryItems]
  );

  const selectedInventoryItem = useMemo(
    () =>
      activeInventoryItems.find(
        (item) => item.agPartNumber === formData.agPartNumber
      ),
    [activeInventoryItems, formData.agPartNumber]
  );

  const isManagerResponse = Boolean(editingRequest);

  // Group requests by department
  const requestsByDepartment = useMemo(() => {
    const grouped = requests.reduce(
      (acc, request) => {
        const dept = request.department || 'No Department';
        if (!acc[dept]) {
          acc[dept] = [];
        }
        acc[dept].push(request);
        return acc;
      },
      {} as Record<string, PartsRequest[]>
    );

    // Sort departments alphabetically, with "No Department" last
    const sortedDepartments = Object.keys(grouped).sort((a, b) => {
      if (a === 'No Department') return 1;
      if (b === 'No Department') return -1;
      return a.localeCompare(b);
    });

    return sortedDepartments.reduce(
      (acc, dept) => {
        acc[dept] = grouped[dept];
        return acc;
      },
      {} as Record<string, PartsRequest[]>
    );
  }, [requests]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/inventory/parts-requests', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      toast.success('Parts request created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
    },
    onError: () => toast.error('Failed to create parts request'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`/api/inventory/parts-requests/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      toast.success('Parts request updated successfully');
      setIsEditOpen(false);
      setEditingRequest(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
    },
    onError: () => toast.error('Failed to update parts request'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/inventory/parts-requests/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Parts request deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
    },
    onError: () => toast.error('Failed to delete parts request'),
  });

  const resetForm = () => {
    requestedByEditedRef.current = false;
    setFormData({
      agPartNumber: '',
      partNumber: '',
      partName: '',
      requestedBy: getDefaultRequestor(sessionUser),
      requestedForEmployeeId: '',
      productionLine: '',
      projectId: initialProjectId,
      department: '',
      quantity: '',
      urgency: 'MEDIUM',
      vendorId: '',
      supplier: '',
      estimatedCost: '',
      reason: '',
      status: 'PENDING',
      expectedDelivery: '',
      notes: '',
      approvalSignature: '',
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'requestedBy') {
      requestedByEditedRef.current = true;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // When the create dialog is open and the session resolves later (or
  // changes), seed the requestedBy field from the signed-in user as long
  // as the user hasn't typed anything into it yet.
  useEffect(() => {
    if (!isCreateOpen) return;
    if (editingRequest) return;
    if (requestedByEditedRef.current) return;
    if (!defaultRequestor) return;
    setFormData((prev) =>
      prev.requestedBy ? prev : { ...prev, requestedBy: defaultRequestor }
    );
  }, [isCreateOpen, editingRequest, defaultRequestor]);

  useEffect(() => {
    if (!initialProjectId) return;
    setFormData((prev) => ({ ...prev, projectId: initialProjectId }));
    if (openCreateFromQuery) {
      setIsCreateOpen(true);
    }
  }, [initialProjectId, openCreateFromQuery]);

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleInventoryItemSelect = (item: InventoryItem) => {
    setFormData((prev) => ({
      ...prev,
      agPartNumber: item.agPartNumber,
      partNumber: item.agPartNumber,
      partName: item.name,
      vendorId: item.vendorId ? String(item.vendorId) : '',
      supplier: item.source || prev.supplier,
    }));
    setIsPartSelectOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.partNumber ||
      !formData.partName ||
      !formData.requestedBy ||
      !formData.quantity
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    const submitData: Record<string, unknown> = {
      agPartNumber: formData.agPartNumber,
      partNumber: formData.partNumber,
      partName: formData.partName,
      requestedBy: formData.requestedBy,
      requestedForEmployeeId: formData.requestedForEmployeeId
        ? parseInt(formData.requestedForEmployeeId)
        : null,
      productionLine: formData.productionLine || null,
      projectId: formData.projectId || null,
      department: formData.department || null,
      quantity: parseInt(formData.quantity),
      urgency: formData.urgency,
      reason: formData.reason || null,
      status: isManagerResponse ? formData.status : 'PENDING',
    };

    const selectedVendorId = formData.vendorId
      ? parseInt(formData.vendorId)
      : selectedInventoryItem?.vendorId ?? null;
    if (selectedVendorId && !Number.isNaN(selectedVendorId)) {
      submitData.vendorId = selectedVendorId;
    }
    submitData.supplier = formData.supplier || selectedInventoryItem?.source || null;

    if (isManagerResponse) {
      submitData.estimatedCost = formData.estimatedCost
        ? parseFloat(formData.estimatedCost)
        : null;
      submitData.expectedDelivery = formData.expectedDelivery || null;
      submitData.notes = formData.notes || null;
      if (formData.status === 'APPROVED') {
        if (!formData.approvalSignature.trim()) {
          toast.error('Digital approval signature is required to approve a request');
          return;
        }
        submitData.approvedBy = formData.approvalSignature.trim();
        submitData.digitalApprovalSignature = `Inventory manager approval: ${formData.approvalSignature.trim()}`;
      }
    }

    if (editingRequest) {
      updateMutation.mutate({ id: editingRequest.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (request: PartsRequest) => {
    requestedByEditedRef.current = true;
    setEditingRequest(request);
    setFormData({
      agPartNumber: request.agPartNumber || '',
      partNumber: request.partNumber,
      partName: request.partName,
      requestedBy: request.requestedBy,
      requestedForEmployeeId: request.requestedForEmployeeId
        ? String(request.requestedForEmployeeId)
        : '',
      productionLine: request.productionLine || '',
      projectId: request.projectId || '',
      department: request.department || '',
      quantity: request.quantity.toString(),
      urgency: request.urgency,
      vendorId: request.vendorId ? String(request.vendorId) : '',
      supplier: request.supplier || '',
      estimatedCost: request.estimatedCost
        ? request.estimatedCost.toString()
        : '',
      reason: request.reason || '',
      status: request.status,
      expectedDelivery: request.expectedDelivery
        ? new Date(request.expectedDelivery).toISOString().split('T')[0]
        : '',
      notes: request.notes || '',
      approvalSignature: '',
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this parts request?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PENDING_OWNER_APPROVAL':
        return 'bg-amber-100 text-amber-900';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'ORDERED':
        return 'bg-blue-100 text-blue-800';
      case 'RECEIVED':
        return 'bg-gray-100 text-gray-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyBadgeColor = (urgency: string) => {
    switch (urgency) {
      case 'LOW':
        return 'bg-gray-100 text-gray-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800';
      case 'CRITICAL':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRequestDate = (value?: string | Date | null) => {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return date.toLocaleDateString();
  };

  const dialogContentClass =
    'flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden';

  const renderFormContent = () => (
    <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="min-w-0">
          <Label htmlFor="inventoryItem">Inventory Part *</Label>
          <Popover open={isPartSelectOpen} onOpenChange={setIsPartSelectOpen}>
            <PopoverTrigger asChild>
              <Button
                id="inventoryItem"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={isPartSelectOpen}
                className={cn(
                  'min-w-0 w-full justify-between overflow-hidden',
                  !formData.agPartNumber && 'text-muted-foreground'
                )}
                disabled={isLoadingInventory}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {selectedInventoryItem
                    ? `${selectedInventoryItem.agPartNumber} - ${selectedInventoryItem.name}`
                    : formData.partNumber && formData.partName
                      ? `${formData.partNumber} - ${formData.partName}`
                      : isLoadingInventory
                        ? 'Loading inventory...'
                        : 'Search inventory by part number or name...'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-3rem)] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Type part number or name..." />
                <CommandList>
                  <CommandEmpty>No inventory items found.</CommandEmpty>
                  <CommandGroup>
                    {activeInventoryItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.agPartNumber} ${item.name}`}
                        onSelect={() => handleInventoryItemSelect(item)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            item.agPartNumber === formData.agPartNumber
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="shrink-0 font-mono text-sm font-medium">
                              {item.agPartNumber}
                            </span>
                            <span className="truncate">{item.name}</span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {formData.partNumber && formData.partName && (
            <p className="mt-2 text-xs text-muted-foreground">
              Selected part: {formData.partNumber} - {formData.partName}
              {formData.supplier ? ` | Source: ${formData.supplier}` : ''}
            </p>
          )}
        </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="requestedBy">Requested By *</Label>
          <Input
            id="requestedBy"
            name="requestedBy"
            value={formData.requestedBy}
            onChange={handleChange}
            placeholder="Enter requestor name"
            required
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="requestedForEmployeeId">Requested For</Label>
          <Select
            value={formData.requestedForEmployeeId || NONE_VALUE}
            onValueChange={(value) =>
              handleSelectChange('requestedForEmployeeId', value === NONE_VALUE ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No employee selected</SelectItem>
              {activeEmployees.map((employee) => (
                <SelectItem key={employee.id} value={String(employee.id)}>
                  {employee.name}{employee.department ? ` - ${employee.department}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="productionLine">Production Line</Label>
          <Select
            value={formData.productionLine || NONE_VALUE}
            onValueChange={(value) =>
              handleSelectChange('productionLine', value === NONE_VALUE ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional line" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No line selected</SelectItem>
              <SelectItem value="P1">P1</SelectItem>
              <SelectItem value="P2">P2</SelectItem>
              <SelectItem value="P3">P3</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="projectId">Project</Label>
          <Select
            value={formData.projectId || NONE_VALUE}
            onValueChange={(value) =>
              handleSelectChange('projectId', value === NONE_VALUE ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No project selected</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.projectCode} - {project.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="department">Department</Label>
          <Select
            value={formData.department || NONE_VALUE}
            onValueChange={(value) =>
              handleSelectChange('department', value === NONE_VALUE ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No department selected</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.name}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            value={formData.quantity}
            onChange={handleChange}
            placeholder="0"
            required
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="urgency">Urgency</Label>
          <Select
            value={formData.urgency}
            onValueChange={(value) => handleSelectChange('urgency', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isManagerResponse && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="min-w-0">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleSelectChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PENDING_OWNER_APPROVAL" disabled>
                    Pending Owner Approval
                  </SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="ORDERED">Ordered</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                name="supplier"
                value={formData.supplier}
                onChange={handleChange}
                placeholder="Enter supplier name"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="estimatedCost">Estimated Cost</Label>
              <Input
                id="estimatedCost"
                name="estimatedCost"
                type="number"
                step="0.01"
                value={formData.estimatedCost}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="expectedDelivery">Estimated Arrival</Label>
            <Input
              id="expectedDelivery"
              name="expectedDelivery"
              type="date"
              value={formData.expectedDelivery}
              onChange={handleChange}
            />
          </div>

          {formData.status === 'APPROVED' && (
            <div>
              <Label htmlFor="approvalSignature">Digital Approval Signature</Label>
              <Input
                id="approvalSignature"
                name="approvalSignature"
                value={formData.approvalSignature}
                onChange={handleChange}
                placeholder="Type inventory manager name"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Requests over $1,000 will move to owner approval after this review.
              </p>
            </div>
          )}
        </>
      )}

      <div>
        <Label htmlFor="reason">Reason</Label>
        <Textarea
          id="reason"
          name="reason"
          value={formData.reason}
          onChange={handleChange}
          placeholder="Why is this part needed?"
          rows={2}
        />
      </div>

      {isManagerResponse && (
        <div>
          <Label htmlFor="notes">Inventory Manager Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Order, denial, RFQ, PO acceptance, or shipment notes"
            rows={2}
          />
        </div>
      )}
      </div>

      <div className="mt-4 flex shrink-0 justify-end space-x-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (editingRequest) {
              setIsEditOpen(false);
              setEditingRequest(null);
            } else {
              setIsCreateOpen(false);
            }
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {editingRequest ? 'Update' : 'Create'} Request
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Parts Requests</h3>
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className={dialogContentClass}>
            <DialogHeader className="shrink-0">
              <DialogTitle>Create New Parts Request</DialogTitle>
            </DialogHeader>
            {renderFormContent()}
          </DialogContent>
        </Dialog>
      </div>

      {/* Parts Requests by Department */}
      {isLoading ? (
        <div className="text-center py-8">Loading parts requests...</div>
      ) : Object.keys(requestsByDepartment).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No parts requests found
        </div>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={Object.keys(requestsByDepartment)}
          className="space-y-3"
        >
          {Object.entries(requestsByDepartment).map(
            ([department, deptRequests]) => (
              <AccordionItem
                key={department}
                value={department}
                className="rounded-md border bg-white px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full items-center justify-between pr-4">
                    <span className="text-lg font-semibold text-gray-800">
                      {department}
                    </span>
                    <span className="rounded bg-gray-50 px-2 py-1 text-sm text-gray-600">
                      {deptRequests.length} request
                      {deptRequests.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </AccordionTrigger>

                {/* Department Requests Grid */}
                <AccordionContent className="pt-1">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {deptRequests.map((request) => (
                      <div
                        key={request.id}
                        className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow bg-white"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="font-medium">{request.partName}</h5>
                            <p className="text-sm text-gray-600">
                              Part: {request.partNumber}
                            </p>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(request)}
                              title="Edit"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(request.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={getStatusBadgeColor(request.status)}>
                            {request.status === 'PENDING_OWNER_APPROVAL'
                              ? 'OWNER APPROVAL'
                              : request.status}
                          </Badge>
                          <Badge
                            className={getUrgencyBadgeColor(request.urgency)}
                          >
                            {request.urgency}
                          </Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>By: {request.requestedBy}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>For: {request.requestedForDisplayName || '—'}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>Created: {formatRequestDate(request.requestDate)}</span>
                          </div>

                        {(request.productionLine || request.project) && (
                          <div className="flex flex-wrap gap-2">
                            {request.productionLine && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                <Factory className="h-3 w-3" />
                                {request.productionLine}
                              </span>
                            )}
                            {request.project && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                <FolderOpen className="h-3 w-3" />
                                {request.project.projectCode} - {request.project.projectName}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-400" />
                          <span>Qty: {request.quantity}</span>
                          {request.estimatedCost && (
                            <span className="text-gray-500">
                              • ${request.estimatedCost.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {request.supplier && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              Supplier: {request.supplier}
                            </span>
                          </div>
                        )}

                        {request.approvalStatus && (
                          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                            Approval: {request.approvalStatus}
                            {request.approvalRequiredRole === 'OWNER'
                              ? ' - owner required'
                              : ''}
                            {request.approvedDate
                              ? ` - ${new Date(request.approvedDate).toLocaleString()}`
                              : ''}
                          </div>
                        )}

                        {Array.isArray(request.approvalHistory) &&
                          request.approvalHistory.length > 0 && (
                            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded space-y-1">
                              <div className="font-medium text-gray-700">Approval History</div>
                              {request.approvalHistory.slice(-3).map((event, index) => (
                                <div key={`${request.id}-approval-${index}`}>
                                  {String(event.event || 'APPROVAL')} by{' '}
                                  {String(event.actor || 'System')}
                                  {event.occurredAt
                                    ? ` - ${new Date(String(event.occurredAt)).toLocaleString()}`
                                    : ''}
                                </div>
                              ))}
                            </div>
                          )}

                        {request.expectedDelivery && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>
                              ETA:{' '}
                              {new Date(
                                request.expectedDelivery
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}

                        {request.vendorPO && (
                          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                            <Package className="h-3 w-3" />
                            <span>
                              Vendor PO:{' '}
                              {request.vendorPO.poNumber || `Draft #${request.vendorPO.id}`}
                              {request.vendorPO.status ? ` (${request.vendorPO.status})` : ''}
                            </span>
                          </div>
                        )}

                        {request.reason && (
                          <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                            {request.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                </AccordionContent>
              </AccordionItem>
            )
          )}
        </Accordion>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingRequest(null);
            resetForm();
          }
        }}
      >
        <DialogContent className={dialogContentClass}>
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Parts Request</DialogTitle>
          </DialogHeader>
          {renderFormContent()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

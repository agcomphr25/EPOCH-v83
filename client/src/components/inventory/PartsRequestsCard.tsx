import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Calendar, User, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PartsRequest } from '@shared/schema';

interface PartsRequestFormData {
  partNumber: string;
  partName: string;
  requestedBy: string;
  department: string;
  quantity: string;
  urgency: string;
  supplier: string;
  estimatedCost: string;
  reason: string;
  status: string;
  expectedDelivery: string;
  notes: string;
}

export default function PartsRequestsCard() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PartsRequest | null>(null);

  const [formData, setFormData] = useState<PartsRequestFormData>({
    partNumber: '',
    partName: '',
    requestedBy: '',
    department: '',
    quantity: '',
    urgency: 'MEDIUM',
    supplier: '',
    estimatedCost: '',
    reason: '',
    status: 'PENDING',
    expectedDelivery: '',
    notes: ''
  });

  // Load parts requests
  const { data: requests = [], isLoading } = useQuery<PartsRequest[]>({
    queryKey: ['/api/parts-requests'],
    queryFn: () => apiRequest('/api/parts-requests'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/parts-requests', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Parts request created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/parts-requests'] });
    },
    onError: () => toast.error('Failed to create parts request'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/parts-requests/${id}`, {
      method: 'PUT',
      body: data
    }),
    onSuccess: () => {
      toast.success('Parts request updated successfully');
      setIsEditOpen(false);
      setEditingRequest(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/parts-requests'] });
    },
    onError: () => toast.error('Failed to update parts request'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/parts-requests/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast.success('Parts request deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/parts-requests'] });
    },
    onError: () => toast.error('Failed to delete parts request'),
  });

  const resetForm = () => {
    setFormData({
      partNumber: '',
      partName: '',
      requestedBy: '',
      department: '',
      quantity: '',
      urgency: 'MEDIUM',
      supplier: '',
      estimatedCost: '',
      reason: '',
      status: 'PENDING',
      expectedDelivery: '',
      notes: ''
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.partNumber || !formData.partName || !formData.requestedBy || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const submitData = {
      partNumber: formData.partNumber,
      partName: formData.partName,
      requestedBy: formData.requestedBy,
      department: formData.department || null,
      quantity: parseInt(formData.quantity),
      urgency: formData.urgency,
      supplier: formData.supplier || null,
      estimatedCost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : null,
      reason: formData.reason || null,
      status: formData.status,
      expectedDelivery: formData.expectedDelivery || null,
      notes: formData.notes || null,
    };

    if (editingRequest) {
      updateMutation.mutate({ id: editingRequest.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (request: PartsRequest) => {
    setEditingRequest(request);
    setFormData({
      partNumber: request.partNumber,
      partName: request.partName,
      requestedBy: request.requestedBy,
      department: request.department || '',
      quantity: request.quantity.toString(),
      urgency: request.urgency,
      supplier: request.supplier || '',
      estimatedCost: request.estimatedCost ? request.estimatedCost.toString() : '',
      reason: request.reason || '',
      status: request.status,
      expectedDelivery: request.expectedDelivery ? new Date(request.expectedDelivery).toISOString().split('T')[0] : '',
      notes: request.notes || '',
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
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'ORDERED': return 'bg-blue-100 text-blue-800';
      case 'RECEIVED': return 'bg-gray-100 text-gray-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyBadgeColor = (urgency: string) => {
    switch (urgency) {
      case 'LOW': return 'bg-gray-100 text-gray-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const FormContent = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="partNumber">Part Number *</Label>
          <Input
            id="partNumber"
            name="partNumber"
            value={formData.partNumber}
            onChange={handleChange}
            placeholder="Enter part number"
            required
          />
        </div>
        <div>
          <Label htmlFor="partName">Part Name *</Label>
          <Input
            id="partName"
            name="partName"
            value={formData.partName}
            onChange={handleChange}
            placeholder="Enter part name"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
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
        <div>
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            name="department"
            value={formData.department}
            onChange={handleChange}
            placeholder="Enter department"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
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
        <div>
          <Label htmlFor="urgency">Urgency</Label>
          <Select value={formData.urgency} onValueChange={(value) => handleSelectChange('urgency', value)}>
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
        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => handleSelectChange('status', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="ORDERED">Ordered</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="supplier">Supplier</Label>
          <Input
            id="supplier"
            name="supplier"
            value={formData.supplier}
            onChange={handleChange}
            placeholder="Enter supplier name"
          />
        </div>
        <div>
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
        <Label htmlFor="expectedDelivery">Expected Delivery</Label>
        <Input
          id="expectedDelivery"
          name="expectedDelivery"
          type="date"
          value={formData.expectedDelivery}
          onChange={handleChange}
        />
      </div>

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

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Additional notes"
          rows={2}
        />
      </div>

      <div className="flex justify-end space-x-2">
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
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Parts Request</DialogTitle>
            </DialogHeader>
            <FormContent />
          </DialogContent>
        </Dialog>
      </div>

      {/* Parts Requests Grid */}
      {isLoading ? (
        <div className="text-center py-8">Loading parts requests...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map((request) => (
            <div key={request.id} className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{request.partName}</h4>
                  <p className="text-sm text-gray-600">Part: {request.partNumber}</p>
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
                  {request.status}
                </Badge>
                <Badge className={getUrgencyBadgeColor(request.urgency)}>
                  {request.urgency}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span>{request.requestedBy}</span>
                  {request.department && <span className="text-gray-500">({request.department})</span>}
                </div>
                
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-400" />
                  <span>Qty: {request.quantity}</span>
                  {request.estimatedCost && <span className="text-gray-500">• ${request.estimatedCost.toFixed(2)}</span>}
                </div>

                {request.expectedDelivery && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>Expected: {new Date(request.expectedDelivery).toLocaleDateString()}</span>
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
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setEditingRequest(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Parts Request</DialogTitle>
          </DialogHeader>
          <FormContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
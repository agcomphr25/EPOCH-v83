import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPOs, createPO, updatePO, deletePO, type PurchaseOrder, type CreatePurchaseOrderData } from '@/lib/poUtils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function POManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: pos = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/pos'],
    queryFn: fetchPOs
  });

  const createMutation = useMutation({
    mutationFn: createPO,
    onSuccess: () => {
      toast.success('Purchase order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
      setEditingPO(null);
    },
    onError: () => {
      toast.error('Failed to create purchase order');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseOrderData> }) => updatePO(id, data),
    onSuccess: () => {
      toast.success('Purchase order updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
      setEditingPO(null);
    },
    onError: () => {
      toast.error('Failed to update purchase order');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deletePO,
    onSuccess: () => {
      toast.success('Purchase order deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
    },
    onError: () => {
      toast.error('Failed to delete purchase order');
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data: CreatePurchaseOrderData = {
      poNumber: formData.get('poNumber') as string,
      customerId: formData.get('customerId') as string,
      customerName: formData.get('customerName') as string,
      poDate: formData.get('poDate') as string,
      expectedDelivery: formData.get('expectedDelivery') as string,
      status: formData.get('status') as 'OPEN' | 'CLOSED' | 'CANCELED',
      notes: formData.get('notes') as string || undefined
    };

    if (editingPO) {
      updateMutation.mutate({ id: editingPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPO(po);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this purchase order?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredPOs = pos.filter(po => 
    po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-800';
      case 'CANCELED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Purchase Order Management</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingPO(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPO ? 'Edit Purchase Order' : 'Add New Purchase Order'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="poNumber">PO Number</Label>
                  <Input 
                    id="poNumber" 
                    name="poNumber" 
                    defaultValue={editingPO?.poNumber || ''}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="customerId">Customer ID</Label>
                  <Input 
                    id="customerId" 
                    name="customerId" 
                    defaultValue={editingPO?.customerId || ''}
                    required 
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="customerName">Customer Name</Label>
                <Input 
                  id="customerName" 
                  name="customerName" 
                  defaultValue={editingPO?.customerName || ''}
                  required 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="poDate">PO Date</Label>
                  <Input 
                    id="poDate" 
                    name="poDate" 
                    type="date" 
                    defaultValue={editingPO?.poDate || ''}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="expectedDelivery">Expected Delivery</Label>
                  <Input 
                    id="expectedDelivery" 
                    name="expectedDelivery" 
                    type="date" 
                    defaultValue={editingPO?.expectedDelivery || ''}
                    required 
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={editingPO?.status || 'OPEN'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                    <SelectItem value="CANCELED">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes" 
                  name="notes" 
                  defaultValue={editingPO?.notes || ''}
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingPO ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Search by PO number or customer name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading purchase orders...</div>
      ) : (
        <div className="grid gap-4">
          {filteredPOs.map((po) => (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{po.poNumber}</CardTitle>
                    <CardDescription>{po.customerName}</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(po.status)}>
                      {po.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(po)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(po.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">PO Date:</span> {new Date(po.poDate).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Expected Delivery:</span> {new Date(po.expectedDelivery).toLocaleDateString()}
                  </div>
                  {po.notes && (
                    <div className="col-span-2">
                      <span className="font-medium">Notes:</span> {po.notes}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
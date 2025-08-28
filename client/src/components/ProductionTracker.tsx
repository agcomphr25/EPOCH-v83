import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchProductionOrders, 
  updateProductionOrder,
  getProductionSummaryByPO,
  type ProductionOrder,
  type ProductionOrderUpdate
} from '@/lib/productionUtils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, 
  Clock, 
  CheckCircle, 
  Truck, 
  Edit, 
  Search,
  BarChart3,
  ListChecks,
  TrendingUp
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ProductionTracker() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'LAID_UP' | 'SHIPPED'>('ALL');
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Form state for editing
  const [formData, setFormData] = useState({
    productionStatus: 'PENDING' as 'PENDING' | 'LAID_UP' | 'SHIPPED',
    laidUpAt: '',
    shippedAt: '',
    notes: ''
  });

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/production-orders'],
    queryFn: fetchProductionOrders
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProductionOrderUpdate }) => updateProductionOrder(id, data),
    onSuccess: () => {
      toast.success('Production order updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/production-orders'] });
      setIsDialogOpen(false);
      setEditingOrder(null);
    },
    onError: () => {
      toast.error('Failed to update production order');
    }
  });

  // Filter orders based on search and status
  const filteredOrders = orders.filter(order => {
    const matchesSearch = !searchTerm || 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.itemName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || order.productionStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Get summary by PO
  const poSummary = getProductionSummaryByPO(filteredOrders);

  const handleEdit = (order: ProductionOrder) => {
    setEditingOrder(order);
    setFormData({
      productionStatus: order.productionStatus,
      laidUpAt: order.laidUpAt ? new Date(order.laidUpAt).toISOString().split('T')[0] : '',
      shippedAt: order.shippedAt ? new Date(order.shippedAt).toISOString().split('T')[0] : '',
      notes: order.notes || ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const updateData: ProductionOrderUpdate = {
      productionStatus: formData.productionStatus,
      notes: formData.notes || undefined
    };

    // Set timestamps based on status
    if (formData.productionStatus === 'LAID_UP' && formData.laidUpAt) {
      updateData.laidUpAt = new Date(formData.laidUpAt).toISOString();
    }
    if (formData.productionStatus === 'SHIPPED' && formData.shippedAt) {
      updateData.shippedAt = new Date(formData.shippedAt).toISOString();
    }

    updateMutation.mutate({ id: editingOrder.id, data: updateData });
  };

  const getStatusBadge = (status: ProductionOrder['productionStatus']) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'LAID_UP':
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Laid Up</Badge>;
      case 'SHIPPED':
        return <Badge variant="outline"><Truck className="w-3 h-3 mr-1" />Shipped</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Production Tracking</h2>
          <p className="text-gray-600">Track production orders from customer POs</p>
        </div>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            All Orders
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Production Summary by PO</CardTitle>
              <CardDescription>Overview of production status for each purchase order</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total Orders</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Laid Up</TableHead>
                    <TableHead>Shipped</TableHead>
                    <TableHead>Remaining to Layup</TableHead>
                    <TableHead>Remaining to Ship</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poSummary.map((summary, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{summary.poNumber}</TableCell>
                      <TableCell>{summary.customerName}</TableCell>
                      <TableCell>{summary.total}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{summary.pending}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{summary.laidUp}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{summary.shipped}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={summary.remainingToLayup > 0 ? "destructive" : "secondary"}>
                          {summary.remainingToLayup}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={summary.remainingToShip > 0 ? "destructive" : "secondary"}>
                          {summary.remainingToShip}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          {/* Search and Filter Controls */}
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search orders, PO numbers, customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="LAID_UP">Laid Up</SelectItem>
                <SelectItem value="SHIPPED">Shipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          <Card>
            <CardHeader>
              <CardTitle>Production Orders ({filteredOrders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderId}</TableCell>
                      <TableCell>{order.poNumber}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.itemName}</TableCell>
                      <TableCell>{getStatusBadge(order.productionStatus)}</TableCell>
                      <TableCell>{new Date(order.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(order)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Production Analytics</CardTitle>
              <CardDescription>Coming soon - detailed analytics and reporting</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-500 py-8">
                Analytics dashboard will be available in the next update
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Production Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                value={editingOrder?.orderId || ''}
                disabled
                className="bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="productionStatus">Production Status</Label>
              <Select
                value={formData.productionStatus}
                onValueChange={(value) => setFormData(prev => ({ ...prev, productionStatus: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="LAID_UP">Laid Up</SelectItem>
                  <SelectItem value="SHIPPED">Shipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.productionStatus === 'LAID_UP' && (
              <div>
                <Label htmlFor="laidUpAt">Laid Up Date</Label>
                <Input
                  id="laidUpAt"
                  type="date"
                  value={formData.laidUpAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, laidUpAt: e.target.value }))}
                />
              </div>
            )}

            {formData.productionStatus === 'SHIPPED' && (
              <div>
                <Label htmlFor="shippedAt">Shipped Date</Label>
                <Input
                  id="shippedAt"
                  type="date"
                  value={formData.shippedAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, shippedAt: e.target.value }))}
                />
              </div>
            )}

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes about this order..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Updating...' : 'Update Order'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
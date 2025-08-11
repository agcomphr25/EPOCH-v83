import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowRight, Search, Package, User, Calendar, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export default function ProductionQueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Fetch orders in Production Queue
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['/api/orders/department', 'P1 Production Queue'],
    queryFn: () => apiRequest(`/api/orders/department/P1%20Production%20Queue`),
  });

  // Mutation to progress orders to next department
  const progressOrdersMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const promises = orderIds.map(orderId => 
        apiRequest(`/api/orders/${orderId}/progress`, {
          method: 'POST',
          body: { nextDepartment: 'Layup' }
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${selectedOrders.length} orders moved to Layup department`,
      });
      setSelectedOrders([]);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to progress orders",
        variant: "destructive",
      });
      console.error('Error progressing orders:', error);
    },
  });

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(order => order.orderId));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleProgressSelected = () => {
    if (selectedOrders.length > 0) {
      progressOrdersMutation.mutate(selectedOrders);
    }
  };

  // Filter orders based on search
  const filteredOrders = orders.filter((order: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.orderId?.toLowerCase().includes(searchLower) ||
      order.customer?.toLowerCase().includes(searchLower) ||
      order.productName?.toLowerCase().includes(searchLower)
    );
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Production Queue Manager</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">Loading orders...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-6 h-6" />
              Production Queue Manager
              <Badge variant="secondary" className="ml-2">
                {filteredOrders.length} orders
              </Badge>
            </CardTitle>
            <div className="flex gap-2">
              {selectedOrders.length > 0 && (
                <Button
                  onClick={handleProgressSelected}
                  disabled={progressOrdersMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Push {selectedOrders.length} to Layup
                </Button>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by Order ID, Customer, or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders found in Production Queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order: any) => (
                  <TableRow key={order.orderId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.orderId)}
                        onChange={() => handleSelectOrder(order.orderId)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{order.orderId}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        {order.customer || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>{order.productName || order.stockModelId || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.priority > 80 ? 'destructive' : order.priority > 60 ? 'default' : 'secondary'}>
                        {order.priority || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => progressOrdersMutation.mutate([order.orderId])}
                        disabled={progressOrdersMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        Push to Layup
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
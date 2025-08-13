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
          body: JSON.stringify({ nextDepartment: 'Layup' }),
          headers: {
            'Content-Type': 'application/json'
          }
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
      setSelectedOrders(filteredOrders.map((order: any) => order.orderId));
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
  const filteredOrders = orders.filter((order: { orderId?: string; fbOrderNumber?: string; customer?: string; productName?: string; }) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.orderId?.toLowerCase().includes(searchLower) ||
      order.fbOrderNumber?.toLowerCase().includes(searchLower) ||
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
    <div className="h-screen flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="container mx-auto p-6 pb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Production Queue Manager</h1>
              <Badge variant="secondary" className="ml-2">
                {filteredOrders.length} orders
              </Badge>
            </div>
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
          
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by Order ID, FB Order Number, Customer, or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sticky Table Header */}
          {filteredOrders.length > 0 && (
            <div className="bg-gray-50 border rounded-t-lg">
              <div className="grid grid-cols-7 gap-4 px-4 py-3 text-sm font-medium text-gray-700">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    className="rounded mr-2"
                  />
                  Select
                </div>
                <div>Order ID</div>
                <div>Customer</div>
                <div>Product</div>
                <div>Due Date</div>
                <div>Priority</div>
                <div>Actions</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-6">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders found in Production Queue
            </div>
          ) : (
            <div className="bg-white border-x border-b rounded-b-lg">
              {filteredOrders.map((order: any) => (
                <div key={order.orderId} className="grid grid-cols-7 gap-4 px-4 py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.orderId)}
                      onChange={() => handleSelectOrder(order.orderId)}
                      className="rounded"
                    />
                  </div>
                  <div className="font-medium">
                    {order.fbOrderNumber || order.orderId}
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{order.customer || 'N/A'}</span>
                  </div>
                  <div className="truncate">{order.productName || order.stockModelId || 'N/A'}</div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div>
                    <Badge variant={order.priority > 80 ? 'destructive' : order.priority > 60 ? 'default' : 'secondary'}>
                      {order.priority || 'N/A'}
                    </Badge>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      onClick={() => progressOrdersMutation.mutate([order.orderId])}
                      disabled={progressOrdersMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <ArrowRight className="w-4 h-4 mr-1" />
                      Push to Layup
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
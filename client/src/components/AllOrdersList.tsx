import React, { useState } from 'react';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  product?: string;
  modelId: string;
  currentDepartment: string;
  status: string;
  fbOrderNumber?: string;
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, AlertTriangle, Package2, Edit } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import ScrapOrderModal from './ScrapOrderModal';
import toast from 'react-hot-toast';
import { Link } from 'wouter';
import { getDisplayOrderId } from '@/lib/orderUtils';

const departments = ['Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'];

export default function AllOrdersList() {
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [scrapModalOrder, setScrapModalOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    if (!modelId || !stockModels || stockModels.length === 0) {
      return modelId || 'Unknown Model';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string, nextDepartment: string }) => {
      return apiRequest(`/api/orders/${orderId}/progress`, {
        method: 'POST',
        body: { nextDepartment }
      });
    },
    onSuccess: () => {
      toast.success('Order progressed successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
    },
    onError: (error) => {
      toast.error(`Failed to progress order: ${error.message}`);
    }
  });

  const scrapOrderMutation = useMutation({
    mutationFn: async ({ orderId, scrapData }: { orderId: string, scrapData: any }) => {
      return apiRequest(`/api/orders/${orderId}/scrap`, {
        method: 'POST',
        body: scrapData
      });
    },
    onSuccess: () => {
      toast.success('Order scrapped successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
      setScrapModalOrder(null);
    },
    onError: (error) => {
      toast.error(`Failed to scrap order: ${error.message}`);
    }
  });

  const createReplacementMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/reload-replacement`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      toast.success('Replacement order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
    onError: (error) => {
      toast.error(`Failed to create replacement: ${error.message}`);
    }
  });

  const filteredOrders = orders?.filter(order => {
    if (selectedDepartment === 'all') return true;
    return order.currentDepartment === selectedDepartment;
  }) || [];

  const handleProgressOrder = (orderId: string, nextDepartment: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment });
  };

  const handleScrapOrder = (scrapData: any) => {
    if (scrapModalOrder) {
      scrapOrderMutation.mutate({ 
        orderId: scrapModalOrder.orderId, 
        scrapData 
      });
    }
  };

  const getDepartmentBadgeColor = (department: string) => {
    const colors: { [key: string]: string } = {
      'Layup': 'bg-blue-500',
      'Plugging': 'bg-orange-500',
      'CNC': 'bg-green-500',
      'Finish': 'bg-yellow-500',
      'Gunsmith': 'bg-purple-500',
      'Paint': 'bg-pink-500',
      'QC': 'bg-indigo-500',
      'Shipping': 'bg-gray-500'
    };
    return colors[department] || 'bg-gray-400';
  };

  const getNextDepartment = (currentDept: string) => {
    const index = departments.indexOf(currentDept);
    return index >= 0 && index < departments.length - 1 ? departments[index + 1] : null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading orders...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            All Orders ({filteredOrders.length})
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Current Department</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map(order => {
                const nextDept = getNextDepartment(order.currentDepartment);
                const isComplete = order.currentDepartment === 'Shipping';
                const isScrapped = order.status === 'SCRAPPED';
                
                return (
                  <TableRow key={order.orderId}>
                    <TableCell className="font-medium" title={order.fbOrderNumber ? `FB Order: ${order.fbOrderNumber} (Order ID: ${order.orderId})` : `Order ID: ${order.orderId}`}>
                      {getDisplayOrderId(order)}
                    </TableCell>
                    <TableCell>
                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit' 
                      }) : '-'}
                    </TableCell>
                    <TableCell>{order.customer || order.customerId}</TableCell>
                    <TableCell>
                      {order.product || getModelDisplayName(order.modelId)}
                      {stockModels.length === 0 && (
                        <span className="text-xs text-gray-400 ml-2">(Loading...)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white`}>
                        {order.currentDepartment}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit' 
                      }) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isScrapped ? 'destructive' : 'default'}>
                        {order.status || 'ACTIVE'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {/* Edit Button - Always available for all orders */}
                        <Link href={`/order-entry?draft=${order.orderId}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </Link>
                        
                        {!isScrapped && !isComplete && nextDept && (
                          <Button
                            size="sm"
                            onClick={() => handleProgressOrder(order.orderId, nextDept)}
                            disabled={progressOrderMutation.isPending}
                          >
                            <ArrowRight className="w-4 h-4 mr-1" />
                            {nextDept}
                          </Button>
                        )}
                        
                        {!isScrapped && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setScrapModalOrder(order)}
                            disabled={scrapOrderMutation.isPending}
                          >
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Scrap
                          </Button>
                        )}
                        
                        {isScrapped && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createReplacementMutation.mutate(order.orderId)}
                            disabled={createReplacementMutation.isPending}
                          >
                            <Package2 className="w-4 h-4 mr-1" />
                            Replace
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          
          {filteredOrders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No orders found for the selected criteria
            </div>
          )}
        </CardContent>
      </Card>

      {scrapModalOrder && (
        <ScrapOrderModal
          order={scrapModalOrder}
          onSubmit={handleScrapOrder}
          onClose={() => setScrapModalOrder(null)}
        />
      )}
    </>
  );
}
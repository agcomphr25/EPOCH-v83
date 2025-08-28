import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  ArrowUp, 
  ArrowDown, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  User,
  Package
} from 'lucide-react';

interface ProductionQueueOrder {
  orderId: string;
  fbOrderNumber?: string;
  modelId: string;
  stockModelId: string;
  dueDate: string;
  orderDate: string;
  currentDepartment: string;
  status: string;
  customerId: string;
  customerName?: string;
  priorityScore: number;
  queuePosition: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

export default function ProductionQueueManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch prioritized production queue
  const { data: productionQueue = [], isLoading, refetch } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Auto-populate production queue mutation
  const autoPopulateMutation = useMutation({
    mutationFn: () => apiRequest('/api/production-queue/auto-populate', { method: 'POST' }),
    onSuccess: (result: any) => {
      toast({
        title: "Production Queue Updated",
        description: `Successfully auto-populated queue with ${result.ordersProcessed} orders`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Auto-Populate Failed",
        description: error.message || "Failed to auto-populate production queue",
        variant: "destructive",
      });
    }
  });

  // Update priorities mutation
  const updatePrioritiesMutation = useMutation({
    mutationFn: (orders: ProductionQueueOrder[]) => 
      apiRequest('/api/production-queue/update-priorities', {
        method: 'POST',
        body: JSON.stringify({ orders })
      }),
    onSuccess: () => {
      toast({
        title: "Priorities Updated",
        description: "Successfully updated order priorities",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Priority Update Failed",
        description: error.message || "Failed to update priorities",
        variant: "destructive",
      });
    }
  });

  const getUrgencyBadgeColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'critical': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high': return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default: return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const newQueue = [...productionQueue];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newQueue.length) return;
    
    // Swap orders
    [newQueue[index], newQueue[targetIndex]] = [newQueue[targetIndex], newQueue[index]];
    
    // Update priority scores and queue positions
    const updatedOrders = newQueue.map((order, idx) => ({
      ...order,
      queuePosition: idx + 1,
      priorityScore: 1000 - idx // Higher position = higher score
    }));

    updatePrioritiesMutation.mutate(updatedOrders);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading production queue...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Queue Manager</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-populate queue, set priorities, and manage production flow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => refetch()}
            variant="outline"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            onClick={() => autoPopulateMutation.mutate()}
            disabled={autoPopulateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            Auto-Populate Queue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-xl font-bold">{productionQueue.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-xl font-bold">
                  {productionQueue.filter(o => o.urgencyLevel === 'critical').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-sm text-gray-500">High Priority</p>
                <p className="text-xl font-bold">
                  {productionQueue.filter(o => o.urgencyLevel === 'high').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Normal</p>
                <p className="text-xl font-bold">
                  {productionQueue.filter(o => o.urgencyLevel === 'normal').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Prioritized Production Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productionQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No orders in production queue</p>
              <p className="text-sm">Use Auto-Populate to add eligible orders</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Priority</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days to Due</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productionQueue.map((order, index) => (
                  <TableRow key={order.orderId} className={order.isOverdue ? 'bg-red-50' : ''}>
                    <TableCell className="font-bold text-center">
                      #{order.queuePosition}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        {order.fbOrderNumber || order.orderId}
                        {order.fbOrderNumber && (
                          <div className="text-xs text-gray-500">{order.orderId}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        {order.customerName || order.customerId}
                      </div>
                    </TableCell>
                    <TableCell>{order.modelId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.stockModelId}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {new Date(order.dueDate).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className={order.isOverdue ? 'text-red-600 font-semibold' : ''}>
                      {order.daysToDue} days
                    </TableCell>
                    <TableCell>
                      <Badge className={getUrgencyBadgeColor(order.urgencyLevel)}>
                        {order.urgencyLevel.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {order.priorityScore}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => movePriority(index, 'up')}
                          disabled={index === 0 || updatePrioritiesMutation.isPending}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => movePriority(index, 'down')}
                          disabled={index === productionQueue.length - 1 || updatePrioritiesMutation.isPending}
                        >
                          <ArrowDown className="w-3 h-3" />
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
    </div>
  );
}
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowRight, Search, Package, User, Calendar, FileText, AlertTriangle, Edit, Eye, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export default function ProductionQueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedAttentionOrders, setSelectedAttentionOrders] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Fetch orders in Production Queue
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['/api/orders/department', 'P1 Production Queue'],
    queryFn: () => apiRequest(`/api/orders/department/P1%20Production%20Queue`),
  });

  // Function to detect orders that need attention
  const needsAttention = (order: any) => {
    const reasons = [];
    
    // Check if model is "None" or null
    if (!order.modelId || order.modelId === 'None' || order.modelId === '') {
      reasons.push('Missing stock model');
    }
    
    // Check for invalid features that would cause mold assignment issues
    if (order.features) {
      const features = typeof order.features === 'string' ? JSON.parse(order.features) : order.features;
      
      // Check for missing action length
      if (!features.action_length || features.action_length === '' || features.action_length === 'None') {
        reasons.push('Missing action length');
      }
      
      // Check for missing material type (CF/FG)
      const modelId = order.modelId || '';
      const isCF = modelId.includes('cf_') || modelId.includes('carbon');
      const isFG = modelId.includes('fg_') || modelId.includes('fiberglass');
      if (!isCF && !isFG && !modelId.includes('mesa_universal')) {
        reasons.push('Unclear material type (CF/FG)');
      }
    }
    
    // Check for missing customer information
    if (!order.customerId || !order.customerName || order.customerName === 'Unknown Customer') {
      reasons.push('Missing customer info');
    }
    
    return reasons;
  };

  // Filter out canceled orders first, then split into regular and needing attention
  const activeOrders = orders.filter((order: any) => {
    // Exclude canceled orders
    if (order.status === 'canceled' || order.status === 'cancelled') {
      return false;
    }
    // Exclude orders with canceled in the notes or special instructions
    if (order.specialInstructions?.toLowerCase().includes('cancel') || 
        order.notes?.toLowerCase().includes('cancel')) {
      return false;
    }
    return true;
  });

  const regularOrders = activeOrders.filter((order: any) => needsAttention(order).length === 0);
  const attentionOrders = activeOrders.filter((order: any) => needsAttention(order).length > 0);

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

  // Mutation to move orders back to draft for editing
  const moveToEditMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const promises = orderIds.map(orderId => 
        apiRequest(`/api/orders/${orderId}/move-to-draft`, {
          method: 'POST',
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
        description: `${selectedAttentionOrders.length} orders moved to draft for editing`,
      });
      setSelectedAttentionOrders([]);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to move orders to draft",
        variant: "destructive",
      });
      console.error('Error moving orders to draft:', error);
    },
  });

  const handleSelectAll = () => {
    const filteredRegularOrders = filteredOrders.filter((order: any) => needsAttention(order).length === 0);
    if (selectedOrders.length === filteredRegularOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredRegularOrders.map((order: any) => order.orderId));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAllAttention = () => {
    const filteredAttentionOrders = filteredOrders.filter((order: any) => needsAttention(order).length > 0);
    if (selectedAttentionOrders.length === filteredAttentionOrders.length) {
      setSelectedAttentionOrders([]);
    } else {
      setSelectedAttentionOrders(filteredAttentionOrders.map((order: any) => order.orderId));
    }
  };

  const handleSelectAttentionOrder = (orderId: string) => {
    setSelectedAttentionOrders(prev => 
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

  const handleMoveToEdit = () => {
    if (selectedAttentionOrders.length > 0) {
      moveToEditMutation.mutate(selectedAttentionOrders);
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

  const filteredRegularOrders = filteredOrders.filter((order: any) => needsAttention(order).length === 0);
  const filteredAttentionOrders = filteredOrders.filter((order: any) => needsAttention(order).length > 0);

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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Production Queue Manager</h1>
          <Badge variant="secondary" className="ml-2">
            {orders.length} total orders
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by Order ID, FB Order Number, Customer, or Product..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Orders Needing Attention Section */}
      {filteredAttentionOrders.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-orange-800">Orders Needing Attention</CardTitle>
                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                  {filteredAttentionOrders.length} orders
                </Badge>
              </div>
              {selectedAttentionOrders.length > 0 && (
                <Button
                  onClick={handleMoveToEdit}
                  disabled={moveToEditMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Move {selectedAttentionOrders.length} to Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-orange-700 bg-orange-100 p-3 rounded">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAttentionOrders.length === filteredAttentionOrders.length && filteredAttentionOrders.length > 0}
                    onChange={handleSelectAllAttention}
                    className="rounded"
                  />
                  <span className="font-medium">Select All ({filteredAttentionOrders.length})</span>
                </div>
                <span>These orders need information before they can be scheduled</span>
              </div>
              {filteredAttentionOrders.map((order: any) => {
                const issues = needsAttention(order);
                return (
                  <div key={order.orderId} className="bg-white border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedAttentionOrders.includes(order.orderId)}
                          onChange={() => handleSelectAttentionOrder(order.orderId)}
                          className="rounded"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{order.orderId}</div>
                          <div className="text-sm text-gray-600">{order.customerName || 'Unknown Customer'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/order-entry?edit=${order.orderId}`, '_blank')}
                          className="text-xs"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <div className="flex flex-col items-end gap-1">
                          {issues.map((issue, index) => (
                            <Badge key={index} variant="destructive" className="text-xs">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      Model: {order.modelId || 'Not set'} | Features: {order.features ? 'Present' : 'Missing'}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ready Orders Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600" />
              <CardTitle className="text-green-800">Ready for Layup</CardTitle>
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                {filteredRegularOrders.length} orders
              </Badge>
            </div>
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
        </CardHeader>
        <CardContent>
          {filteredRegularOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {filteredAttentionOrders.length > 0 
                ? "All orders need attention before they can proceed"
                : "No orders found in Production Queue"
              }
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center text-sm text-green-700 bg-green-100 p-3 rounded">
                <input
                  type="checkbox"
                  checked={selectedOrders.length === filteredRegularOrders.length && filteredRegularOrders.length > 0}
                  onChange={handleSelectAll}
                  className="rounded mr-2"
                />
                <span className="font-medium">Select All ({filteredRegularOrders.length})</span>
              </div>
              {filteredRegularOrders.map((order: any) => (
                <div key={order.orderId} className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.orderId)}
                        onChange={() => handleSelectOrder(order.orderId)}
                        className="rounded"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{order.orderId}</div>
                        <div className="text-sm text-gray-600">{order.customerName || 'Unknown Customer'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/order-entry?edit=${order.orderId}`, '_blank')}
                        className="text-xs"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Badge variant="outline" className="text-xs">
                        {order.modelId || 'No Model'}
                      </Badge>
                      {order.dueDate && (
                        <Badge variant="secondary" className="text-xs">
                          Due: {new Date(order.dueDate).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    Priority: {order.priorityScore || 'Not set'} | Features: {order.features ? 'Present' : 'Missing'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
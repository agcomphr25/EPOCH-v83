import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ProgressiveAllocationCard() {
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [customerOrderId, setCustomerOrderId] = useState('');
  const [productionOrderId, setProductionOrderId] = useState('');
  
  const queryClient = useQueryClient();

  // Allocation mutation
  const allocateMutation = useMutation({
    mutationFn: async (data: { partId: string; quantity: number; customerOrderId: string }) => {
      return await apiRequest('/api/inventory/allocate', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result) => {
      toast.success(`Allocated ${result.allocated} units. Shortage: ${result.shortage}`);
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to allocate: ${error.message}`);
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (data: { partId: string; quantity: number; customerOrderId: string }) => {
      return await apiRequest('/api/inventory/commit', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast.success('Inventory committed successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to commit: ${error.message}`);
    },
  });

  // Consume mutation
  const consumeMutation = useMutation({
    mutationFn: async (data: { partId: string; quantity: number; productionOrderId: string }) => {
      return await apiRequest('/api/inventory/consume', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast.success('Inventory consumed successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to consume: ${error.message}`);
    },
  });

  // Release mutation
  const releaseMutation = useMutation({
    mutationFn: async (data: { partId: string; customerOrderId: string }) => {
      return await apiRequest('/api/inventory/release', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast.success('Allocation released successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to release: ${error.message}`);
    },
  });

  const handleAllocate = () => {
    if (!partId || !quantity || !customerOrderId) {
      toast.error('Please fill in all fields for allocation');
      return;
    }
    allocateMutation.mutate({ partId, quantity: Number(quantity), customerOrderId });
  };

  const handleCommit = () => {
    if (!partId || !quantity || !customerOrderId) {
      toast.error('Please fill in all fields for commit');
      return;
    }
    commitMutation.mutate({ partId, quantity: Number(quantity), customerOrderId });
  };

  const handleConsume = () => {
    if (!partId || !quantity || !productionOrderId) {
      toast.error('Please fill in all fields for consumption');
      return;
    }
    consumeMutation.mutate({ partId, quantity: Number(quantity), productionOrderId });
  };

  const handleRelease = () => {
    if (!partId || !customerOrderId) {
      toast.error('Please fill in Part ID and Customer Order ID for release');
      return;
    }
    releaseMutation.mutate({ partId, customerOrderId });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Progressive Allocation</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage inventory through Available → Allocated → Committed → Consumed workflow
        </p>
      </div>

      {/* Workflow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Badge className="bg-blue-100 text-blue-800 px-4 py-2">
              <Target className="h-4 w-4 mr-2" />
              Available
            </Badge>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <Badge className="bg-orange-100 text-orange-800 px-4 py-2">
              <AlertCircle className="h-4 w-4 mr-2" />
              Allocated
            </Badge>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <Badge className="bg-purple-100 text-purple-800 px-4 py-2">
              <CheckCircle className="h-4 w-4 mr-2" />
              Committed
            </Badge>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <Badge className="bg-green-100 text-green-800 px-4 py-2">
              <CheckCircle className="h-4 w-4 mr-2" />
              Consumed
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Allocation Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Allocate & Commit Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocate & Commit</CardTitle>
            <CardDescription>Reserve inventory for customer orders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="partId">Part ID</Label>
              <Input
                id="partId"
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                placeholder="Enter part ID"
                data-testid="input-part-id"
              />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                data-testid="input-quantity"
              />
            </div>
            <div>
              <Label htmlFor="customerOrderId">Customer Order ID</Label>
              <Input
                id="customerOrderId"
                value={customerOrderId}
                onChange={(e) => setCustomerOrderId(e.target.value)}
                placeholder="Enter customer order ID"
                data-testid="input-customer-order-id"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleAllocate}
                disabled={allocateMutation.isPending}
                className="flex-1"
                data-testid="button-allocate"
              >
                {allocateMutation.isPending ? 'Allocating...' : 'Allocate'}
              </Button>
              <Button 
                onClick={handleCommit}
                disabled={commitMutation.isPending}
                variant="outline"
                className="flex-1"
                data-testid="button-commit"
              >
                {commitMutation.isPending ? 'Committing...' : 'Commit'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Consume & Release Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consume & Release</CardTitle>
            <CardDescription>Finalize or release inventory reservations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="productionOrderId">Production Order ID</Label>
              <Input
                id="productionOrderId"
                value={productionOrderId}
                onChange={(e) => setProductionOrderId(e.target.value)}
                placeholder="Enter production order ID"
                data-testid="input-production-order-id"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleConsume}
                disabled={consumeMutation.isPending}
                className="flex-1"
                data-testid="button-consume"
              >
                {consumeMutation.isPending ? 'Consuming...' : 'Consume'}
              </Button>
              <Button 
                onClick={handleRelease}
                disabled={releaseMutation.isPending}
                variant="outline"
                className="flex-1"
                data-testid="button-release"
              >
                {releaseMutation.isPending ? 'Releasing...' : 'Release'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div><strong>Allocate:</strong> Reserve inventory for a customer order (Available → Allocated)</div>
            <div><strong>Commit:</strong> Confirm the allocation when order is processed (Allocated → Committed)</div>
            <div><strong>Consume:</strong> Mark inventory as used in production (Committed → Consumed)</div>
            <div><strong>Release:</strong> Return allocated inventory back to available pool</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { List, ArrowRight, Package, Factory, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function P2ProductionQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get P2 production queue orders
  const { data: p2ProductionOrders = [], isLoading } = useQuery({
    queryKey: ['/api/p2-production-queue'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Get various department counts for summary cards
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Filter orders for department counts (P2 orders only)
  const p2Orders = (allOrders as any[]).filter((order: any) => order.isP2Order === true);
  const barcodeCount = p2Orders.filter((order: any) => order.currentDepartment === 'Barcode').length;
  const layupCount = p2Orders.filter((order: any) => order.currentDepartment === 'Layup').length;
  const assemblyCount = p2Orders.filter((order: any) => order.currentDepartment === 'Assembly').length;
  const finishCount = p2Orders.filter((order: any) => order.currentDepartment === 'Finish').length;

  // Multi-select functions
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(p2ProductionOrders.map((order: any) => order.orderId)));
    }
    setSelectAll(!selectAll);
  };

  // Mutation for progressing orders to next department
  const progressToNextDepartment = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await fetch('/api/p2-department/progress-to-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      if (!response.ok) throw new Error('Failed to progress orders');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-production-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      setSelectedOrders(new Set());
      setSelectAll(false);
      toast({
        title: "Success",
        description: `${selectedOrders.size} order(s) moved to P2 Barcode department`,
      });
    },
    onError: (error) => {
      console.error('Error progressing orders:', error);
      toast({
        title: "Error",
        description: "Failed to progress orders to P2 Barcode department",
        variant: "destructive"
      });
    }
  });

  const handleProgressOrders = () => {
    if (selectedOrders.size === 0) {
      toast({
        title: "No orders selected",
        description: "Please select orders to progress",
        variant: "destructive"
      });
      return;
    }
    progressToNextDepartment.mutate(Array.from(selectedOrders));
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    const orderExists = p2ProductionOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast({
        title: "Order selected",
        description: `P2 Order ${orderId} selected automatically`,
      });
    } else {
      toast({
        title: "Order not found",
        description: `P2 Order ${orderId} is not in the production queue`,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <List className="h-6 w-6" />
        <h1 className="text-3xl font-bold">P2 Production Queue P2 Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Current Queue Count */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <List className="h-5 w-5" />
              P2 Production Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {p2ProductionOrders.length}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              P2 orders ready for production
            </p>
          </CardContent>
        </Card>

        {/* Next Department - Layup */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <Factory className="h-5 w-5" />
              P2 Layup/Plugging
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {layupCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              P2 orders in next department
            </p>
          </CardContent>
        </Card>

        {/* Further Departments */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              P2 In Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {barcodeCount + layupCount + assemblyCount + finishCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              P2 orders in various departments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-select Actions */}
      {selectedOrders.size > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedOrders.size} P2 order{selectedOrders.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedOrders(new Set());
                    setSelectAll(false);
                  }}
                  className="text-sm"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleProgressOrders}
                  disabled={progressToNextDepartment.isPending}
                  className="bg-green-600 hover:bg-green-700 text-sm"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Move to P2 Barcode ({selectedOrders.size})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* P2 Production Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              P2 Production Queue ({p2ProductionOrders.length} orders)
            </CardTitle>
            {p2ProductionOrders.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectAll}
                  onCheckedChange={toggleSelectAll}
                  id="select-all-p2"
                />
                <label htmlFor="select-all-p2" className="text-sm font-medium cursor-pointer">
                  Select All
                </label>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading P2 production orders...</div>
          ) : p2ProductionOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No P2 orders in production queue
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {p2ProductionOrders.map((order: any) => (
                <Card
                  key={order.orderId}
                  className={`cursor-pointer transition-all ${
                    selectedOrders.has(order.orderId)
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:shadow-md'
                  } ${
                    highlightedOrderId === order.orderId
                      ? 'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                      : ''
                  }`}
                  onClick={() => toggleOrderSelection(order.orderId)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedOrders.has(order.orderId)}
                          onChange={() => toggleOrderSelection(order.orderId)}
                          className="pointer-events-none"
                        />
                        <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">
                          P2 Order
                        </Badge>
                      </div>
                      <Badge variant="secondary">
                        {getDisplayOrderId(order.orderId)}
                      </Badge>
                    </div>
                    <div className="font-semibold text-lg">
                      {order.customerName || 'Unknown Customer'}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>Serial Number:</strong> {order.serialNumber || 'N/A'}
                      </div>
                      <div>
                        <strong>Item Type:</strong> {order.stockModel || 'N/A'}
                      </div>
                      <div>
                        <strong>Due Date:</strong>{' '}
                        {order.dueDate ? format(new Date(order.dueDate), 'MMM dd, yyyy') : 'Not set'}
                      </div>
                      {order.priority && (
                        <Badge
                          variant={order.priority === 'HIGH' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {order.priority} Priority
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
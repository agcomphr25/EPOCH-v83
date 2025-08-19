import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Paintbrush, ArrowLeft, ArrowRight, Users, ArrowUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isAfter } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';

export default function FinishQueuePage() {
  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const queryClient = useQueryClient();

  // Finish technicians list
  const finishTechnicians = [
    'Alex Johnson',
    'Sarah Chen', 
    'Mike Rodriguez',
    'Lisa Thompson',
    'David Park',
    'Emily Carter',
    'Jason Wu',
    'Maria Santos'
  ];

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Finish department
  const finishOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish'
    );
  }, [allOrders]);

  // Count orders in previous department (CNC)
  const cncCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC'
    ).length;
  }, [allOrders]);

  // Count orders in next department (Gunsmith)
  const gunsmithCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Gunsmith'
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Multi-select functions
  const handleSelectOrder = (orderId: string) => {
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

  const handleSelectAll = () => {
    if (selectedOrders.size === finishOrders.length) {
      setSelectedOrders(new Set());
      setSelectAll(false);
    } else {
      setSelectedOrders(new Set(finishOrders.map((order: any) => order.orderId)));
      setSelectAll(true);
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders(new Set());
    setSelectAll(false);
  };

  // Progress orders to Gunsmith mutation
  const progressToGunsimthMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Gunsmith',
          status: 'IN_PROGRESS'
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast.success(`${selectedOrders.size} orders moved to Gunsmith department`);
      setSelectedOrders(new Set());
      setSelectAll(false);
    },
    onError: () => {
      toast.error("Failed to move orders to Gunsmith");
    }
  });

  // Progress orders to Paint mutation (for orders that don't need gunsmith work)
  const progressToPaintMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Paint',
          status: 'IN_PROGRESS'
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast.success(`${selectedOrders.size} orders moved to Paint department`);
      setSelectedOrders(new Set());
      setSelectAll(false);
    },
    onError: () => {
      toast.error("Failed to move orders to Paint");
    }
  });

  const handleProgressToGunsmith = () => {
    if (selectedOrders.size === 0) return;
    progressToGunsimthMutation.mutate(Array.from(selectedOrders));
  };

  const handleProgressToPaint = () => {
    if (selectedOrders.size === 0) return;
    progressToPaintMutation.mutate(Array.from(selectedOrders));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Paintbrush className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Finish Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              CNC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {cncCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

        {/* Next Department Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              Gunsmith
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {gunsmithCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Finish Orders */}
      <Card>
        <CardHeader className="bg-blue-50 dark:bg-blue-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paintbrush className="h-5 w-5 text-blue-600" />
              <span>Finish Orders</span>
              <Badge variant="outline" className="ml-2 border-blue-300">
                {finishOrders.length} Orders
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              {/* Technician Selection */}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishTechnicians.map((tech) => (
                      <SelectItem key={tech} value={tech}>
                        {tech}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-select Controls */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                  Select All
                </label>
                <Button
                  onClick={handleProgressToGunsmith}
                  disabled={selectedOrders.size === 0 || progressToGunsimthMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                  size="sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move to Gunsmith ({selectedOrders.size})
                </Button>
                <Button
                  onClick={handleProgressToPaint}
                  disabled={selectedOrders.size === 0 || progressToPaintMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move to Paint ({selectedOrders.size})
                </Button>
                {selectedOrders.size > 0 && (
                  <Button
                    onClick={handleClearSelection}
                    variant="outline"
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
            </div>
          </CardTitle>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Assigned to {selectedTechnician || 'No technician selected'} • Select orders and route to next department
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {finishOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No orders currently in Finish department
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {finishOrders.map((order: any) => {
                const isSelected = selectedOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <OrderTooltip key={order.orderId} order={order} stockModels={stockModels as any[]}>
                    <div 
                      className={`p-2 border-l-4 rounded cursor-pointer transition-all duration-200 ${
                        isOverdue
                          ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                          : isSelected
                          ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-l-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                      }`}
                      onClick={() => handleSelectOrder(order.orderId)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleSelectOrder(order.orderId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="font-semibold text-sm">
                          {getDisplayOrderId(order)}
                        </div>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">
                            OVERDUE
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                        {getModelDisplayName(order.modelId)}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                          Due: {format(new Date(order.dueDate), 'MMM d')}
                        </div>
                        {order.isPaid && (
                          <Badge variant="secondary" className="text-xs">
                            PAID
                          </Badge>
                        )}
                      </div>
                    </div>
                  </OrderTooltip>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
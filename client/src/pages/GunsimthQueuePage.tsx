import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Target, ArrowLeft, ArrowRight, CheckSquare, Square, ArrowRightCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function GunsimthQueuePage() {
  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Gunsmith department
  const gunsmithOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Gunsmith'
    );
  }, [allOrders]);

  // Count orders in previous department (Finish)
  const finishCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish'
    ).length;
  }, [allOrders]);

  // Count orders in next department (Paint)
  const paintCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Paint'
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Function to extract detailed gunsmith tasks from order features
  const getGunsimthTasks = (order: any) => {
    const tasks = [];
    const features = order.features || {};

    // Check for QD accessories with location details
    if (features.qd_accessory && features.qd_accessory !== 'no_qds') {
      let qdDetail = 'QDs';
      const qdValue = features.qd_accessory;
      
      if (qdValue.includes('qd_2_left')) qdDetail = 'QDs (2 Left)';
      else if (qdValue.includes('qd_2_right')) qdDetail = 'QDs (2 Right)';
      else if (qdValue.includes('qd_2_both')) qdDetail = 'QDs (2 Both Sides)';
      else if (qdValue.includes('qd_1_left')) qdDetail = 'QDs (1 Left)';
      else if (qdValue.includes('qd_1_right')) qdDetail = 'QDs (1 Right)';
      else if (qdValue.includes('left')) qdDetail = 'QDs (Left)';
      else if (qdValue.includes('right')) qdDetail = 'QDs (Right)';
      else if (qdValue.includes('both')) qdDetail = 'QDs (Both Sides)';
      
      tasks.push(qdDetail);
    }

    // Check for rails with type details
    if (features.rail_accessory && features.rail_accessory !== 'no_rail') {
      let railDetails = [];
      const railValue = features.rail_accessory;
      
      if (Array.isArray(railValue)) {
        railDetails = railValue.map(rail => {
          if (rail.includes('arca_6')) return 'ARCA 6"';
          if (rail.includes('arca_12')) return 'ARCA 12"';
          if (rail.includes('arca_18')) return 'ARCA 18"';
          if (rail.includes('mlok')) return 'M-LOK';
          if (rail.includes('picatinny')) return 'Picatinny';
          return rail;
        });
      } else if (typeof railValue === 'string') {
        if (railValue.includes('arca_6')) railDetails.push('ARCA 6"');
        else if (railValue.includes('arca_12')) railDetails.push('ARCA 12"');
        else if (railValue.includes('arca_18')) railDetails.push('ARCA 18"');
        else if (railValue.includes('mlok')) railDetails.push('M-LOK');
        else if (railValue.includes('picatinny')) railDetails.push('Picatinny');
        else railDetails.push(railValue);
      }
      
      if (railDetails.length > 0) {
        tasks.push(`Rails (${railDetails.join(', ')})`);
      } else {
        tasks.push('Rails');
      }
    }

    // Check for tripod mount and tap
    if (features.other_options && Array.isArray(features.other_options)) {
      if (features.other_options.includes('tripod_mount') || features.other_options.includes('mount_and_tap')) {
        tasks.push('Mount & Tap');
      }
      if (features.other_options.includes('tripod')) {
        tasks.push('Tripod');
      }
    }

    // Check for bipod with type details
    if (features.bipod_accessory && features.bipod_accessory !== 'no_bipod') {
      let bipodDetail = 'Bipod';
      const bipodValue = features.bipod_accessory;
      
      if (bipodValue.includes('spartan_javelin')) bipodDetail = 'Spartan Javelin';
      else if (bipodValue.includes('spartan_tac')) bipodDetail = 'Spartan TAC';
      else if (bipodValue.includes('spartan')) bipodDetail = 'Spartan Bipod';
      else if (bipodValue.includes('harris')) bipodDetail = 'Harris Bipod';
      else if (bipodValue.includes('atlas')) bipodDetail = 'Atlas Bipod';
      
      tasks.push(bipodDetail);
    }

    return tasks;
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
    if (selectedOrders.size === gunsmithOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(gunsmithOrders.map((order: any) => order.orderId)));
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders(new Set());
  };

  // Progress orders to Paint mutation
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
      toast({
        title: "Success",
        description: `${selectedOrders.size} orders moved to Paint department`,
      });
      setSelectedOrders(new Set());
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move orders to Paint",
        variant: "destructive",
      });
    }
  });

  // Progress orders to Finish mutation
  const progressToFinishMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Finish',
          status: 'IN_PROGRESS'
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast({
        title: "Success",
        description: `${selectedOrders.size} orders moved to Finish department`,
      });
      setSelectedOrders(new Set());
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move orders to Finish",
        variant: "destructive",
      });
    }
  });

  const handleProgressToPaint = () => {
    if (selectedOrders.size === 0) return;
    progressToPaintMutation.mutate(Array.from(selectedOrders));
  };

  const handleProgressToFinish = () => {
    if (selectedOrders.size === 0) return;
    progressToFinishMutation.mutate(Array.from(selectedOrders));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Target className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Gunsmith Department Manager</h1>
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
              Finish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {finishCount}
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
              Paint
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {paintCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Gunsmith Orders */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Gunsmith Orders ({gunsmithOrders.length})
            </CardTitle>
            
            {gunsmithOrders.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2"
                >
                  {selectedOrders.size === gunsmithOrders.length ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectedOrders.size === gunsmithOrders.length ? 'Deselect All' : 'Select All'}
                </Button>
                
                {selectedOrders.size > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      Clear ({selectedOrders.size})
                    </Button>
                    
                    <Button
                      onClick={handleProgressToPaint}
                      disabled={progressToPaintMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      Move to Paint ({selectedOrders.size})
                    </Button>
                    
                    <Button
                      onClick={handleProgressToFinish}
                      disabled={progressToFinishMutation.isPending}
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      Move to Finish ({selectedOrders.size})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {gunsmithOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No orders currently in Gunsmith department
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {gunsmithOrders.map((order: any) => (
                <div key={order.id} className="relative">
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selectedOrders.has(order.orderId)}
                      onCheckedChange={() => handleSelectOrder(order.orderId)}
                      className="bg-white dark:bg-gray-800 border-2"
                    />
                  </div>
                  <OrderTooltip 
                    order={order} 
                    stockModels={stockModels}
                    gunsimthTasks={getGunsimthTasks(order)}
                    className={`${selectedOrders.has(order.orderId) 
                      ? 'bg-purple-100 dark:bg-purple-800/40 border-purple-400 dark:border-purple-600 ring-2 ring-purple-300 dark:ring-purple-700' 
                      : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                    } pl-8`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
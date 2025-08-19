import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'react-hot-toast';
import { format, isAfter } from 'date-fns';
import { OrderTooltip } from '@/components/OrderTooltip';
import { apiRequest } from '@/lib/queryClient';

export default function FinishQCPage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAllByTechnician, setSelectAllByTechnician] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  // Fetch orders in Finish QC
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['/api/orders/department', 'Finish QC'],
    enabled: true
  }) as { data: any[], isLoading: boolean };

  // Fetch stock models for tooltips
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    enabled: true
  });

  // Group orders by technician and sort (memoized to prevent re-renders)
  const ordersByTechnician = useMemo(() => {
    const grouped = orders.reduce((acc: Record<string, any[]>, order: any) => {
      const technician = order.assignedTechnician || 'Unassigned';
      if (!acc[technician]) {
        acc[technician] = [];
      }
      acc[technician].push(order);
      return acc;
    }, {});

    // Sort orders within each technician group: overdue first, then alphabetically/numerically
    Object.keys(grouped).forEach(technician => {
      grouped[technician].sort((a: any, b: any) => {
        const now = new Date();
        const aIsOverdue = a.dueDate && isAfter(now, new Date(a.dueDate));
        const bIsOverdue = b.dueDate && isAfter(now, new Date(b.dueDate));
        
        // Prioritize overdue orders at the top
        if (aIsOverdue && !bIsOverdue) return -1;
        if (!aIsOverdue && bIsOverdue) return 1;
        
        // If both overdue or both not overdue, sort by due date first (if available)
        if (a.dueDate && b.dueDate) {
          const dateCompare = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (dateCompare !== 0) return dateCompare;
        }
        
        // Extract numeric part from order ID for proper sorting
        const getNumeric = (orderId: string) => {
          const match = orderId.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        
        const aNum = getNumeric(a.orderId);
        const bNum = getNumeric(b.orderId);
        
        if (aNum !== bNum) {
          return aNum - bNum;
        }
        
        // If numeric parts are same, sort alphabetically
        return a.orderId.localeCompare(b.orderId);
      });
    });

    return grouped;
  }, [orders]);

  // Mutation to move orders to Paint
  const moveToPaintMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const promises = orderIds.map(orderId =>
        apiRequest(`/api/orders/${orderId}/department`, {
          method: 'PUT',
          body: JSON.stringify({ department: 'Paint', completedBy: 'Finish QC' }),
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast.success(`Moved ${selectedOrders.size} orders to Paint`);
      setSelectedOrders(new Set());
      setSelectAllByTechnician({});
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
    onError: (error) => {
      console.error('Error moving orders to Paint:', error);
      toast.error('Failed to move orders to Paint');
    }
  });

  // Handle individual order selection
  const handleOrderSelect = (orderId: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (checked) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
    }
    setSelectedOrders(newSelected);
  };

  // Handle select all for a technician
  const handleSelectAllTechnician = (technician: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders);
    const technicianOrders = ordersByTechnician[technician] || [];
    
    if (checked) {
      technicianOrders.forEach(order => newSelected.add(order.orderId));
    } else {
      technicianOrders.forEach(order => newSelected.delete(order.orderId));
    }
    
    setSelectedOrders(newSelected);
    setSelectAllByTechnician(prev => ({ ...prev, [technician]: checked }));
  };

  // Update select all checkboxes based on individual selections
  useEffect(() => {
    const newSelectAll: Record<string, boolean> = {};
    Object.keys(ordersByTechnician).forEach(technician => {
      const technicianOrders = ordersByTechnician[technician];
      const selectedInTechnician = technicianOrders.filter((order: any) => 
        selectedOrders.has(order.orderId)
      ).length;
      newSelectAll[technician] = selectedInTechnician === technicianOrders.length && technicianOrders.length > 0;
    });
    
    // Only update if the state has actually changed
    const currentState = JSON.stringify(selectAllByTechnician);
    const newState = JSON.stringify(newSelectAll);
    if (currentState !== newState) {
      setSelectAllByTechnician(newSelectAll);
    }
  }, [selectedOrders, ordersByTechnician, selectAllByTechnician]);

  const handleMoveToPaint = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select orders to move');
      return;
    }
    moveToPaintMutation.mutate(Array.from(selectedOrders));
  };

  // Helper function to get texture information
  const getTextureInfo = (order: any) => {
    if (!order.features) return 'No texture';
    const features = order.features;
    
    if (features.texture_options) {
      if (features.texture_options === 'no_texture') {
        return 'No texture';
      } else if (features.texture_options === 'grip_and_forend') {
        return 'Grip & forend';
      } else if (features.texture_options === 'full_texture') {
        return 'Full texture';
      } else if (features.texture_options === 'grip_only') {
        return 'Grip only';
      } else {
        return features.texture_options.replace(/_/g, ' ');
      }
    }
    
    return 'No texture';
  };

  // Helper function to get paint color information
  const getPaintColor = (order: any) => {
    if (!order.features) return 'No paint';
    const features = order.features;
    
    // Check paint_options_combined first (newer format)
    if (features.paint_options_combined) {
      const paintOption = features.paint_options_combined;
      if (paintOption.includes(':')) {
        const [type, color] = paintOption.split(':');
        if (type === 'base_colors') {
          return color.replace(/_/g, ' ');
        } else if (type === 'custom_graphics') {
          return `${color.replace(/_/g, ' ')} (graphics)`;
        }
      }
      return paintOption.replace(/_/g, ' ');
    }
    
    // Check paint_options (older format)
    if (features.paint_options) {
      if (features.paint_options === 'no_paint') {
        return 'No paint';
      }
      return features.paint_options.replace(/_/g, ' ');
    }
    
    return 'No paint';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading Finish QC orders...</div>
      </div>
    );
  }

  const technicians = Object.keys(ordersByTechnician).sort();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Finish QC Department</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Quality control review organized by technician
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleMoveToPaint}
            disabled={selectedOrders.size === 0 || moveToPaintMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Move to Paint ({selectedOrders.size})
          </Button>
          
          {selectedOrders.size > 0 && (
            <Button
              variant="outline"
              onClick={() => setSelectedOrders(new Set())}
            >
              Clear Selection
            </Button>
          )}
        </div>
      </div>

      {technicians.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400">
            No orders in Finish QC
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {technicians.map(technician => {
            const technicianOrders = ordersByTechnician[technician];
            const selectedCount = technicianOrders.filter((order: any) => 
              selectedOrders.has(order.orderId)
            ).length;

            return (
              <Card key={technician}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectAllByTechnician[technician] || false}
                        onCheckedChange={(checked) => 
                          handleSelectAllTechnician(technician, checked as boolean)
                        }
                      />
                      <CardTitle className="text-xl">
                        {technician === 'Unassigned' ? 'Unassigned Orders' : `${technician}'s QC`}
                      </CardTitle>
                      <Badge variant="secondary">
                        {technicianOrders.length} orders
                      </Badge>
                      {selectedCount > 0 && (
                        <Badge variant="default">
                          {selectedCount} selected
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-4">
                  <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
                    {technicianOrders.map((order: any) => {
                      const isSelected = selectedOrders.has(order.orderId);
                      const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                      
                      return (
                        <div 
                          key={order.orderId}
                          className={`p-2 border rounded cursor-pointer transition-all duration-200 ${
                            isOverdue
                              ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                              : isSelected
                                ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => 
                                  handleOrderSelect(order.orderId, checked as boolean)
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 flex-shrink-0"
                              />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-medium text-sm truncate">{order.orderId}</span>
                                  {order.fbOrderNumber && (
                                    <Badge variant="outline" className="text-xs px-1 py-0">
                                      FB
                                    </Badge>
                                  )}
                                  {order.isPaid && (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs px-1 py-0">
                                      $
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="text-xs text-gray-600 dark:text-gray-400 truncate mb-1">
                                  {order.customerName}
                                </div>
                                
                                <div className="flex gap-1">
                                  <Badge variant="secondary" className="text-xs px-1 py-0 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">
                                    {getTextureInfo(order).split(' ')[0]}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs px-1 py-0 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
                                    {getPaintColor(order).includes('No') ? 'None' : getPaintColor(order).split(' ')[0]}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                              {order.dueDate && (
                                <Badge 
                                  variant={isOverdue ? "destructive" : "outline"} 
                                  className="text-xs px-1 py-0"
                                >
                                  {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
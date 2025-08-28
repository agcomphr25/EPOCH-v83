import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { toast } from 'react-hot-toast';
import { format, isAfter } from 'date-fns';
import { OrderTooltip } from '@/components/OrderTooltip';
import { AlertTriangle, FileText, Eye, TrendingDown } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function FinishQCPage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAllByTechnician, setSelectAllByTechnician] = useState<Record<string, boolean>>({});
  const [salesOrderModalOpen, setSalesOrderModalOpen] = useState(false);
  const [salesOrderContent, setSalesOrderContent] = useState('');
  const [salesOrderLoading, setSalesOrderLoading] = useState(false);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

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

  // Fetch all kickbacks to determine which orders have kickbacks
  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Helper function to check if an order has kickbacks
  const hasKickbacks = (orderId: string) => {
    return (allKickbacks as any[]).some((kickback: any) => kickback.orderId === orderId);
  };

  // Helper function to get the most severe kickback status for an order
  const getKickbackStatus = (orderId: string) => {
    const orderKickbacks = (allKickbacks as any[]).filter((kickback: any) => kickback.orderId === orderId);
    if (orderKickbacks.length === 0) return null;

    // Priority order: CRITICAL > HIGH > MEDIUM > LOW
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const highestPriority = orderKickbacks.reduce((highest: string, kickback: any) => {
      const currentIndex = priorities.indexOf(kickback.priority);
      const highestIndex = priorities.indexOf(highest);
      return currentIndex < highestIndex ? kickback.priority : highest;
    }, 'LOW');

    return highestPriority;
  };

  // Function to handle kickback badge click
  const handleKickbackClick = (orderId: string) => {
    setLocation('/kickback-tracking');
  };

  // Function to handle sales order view in modal
  const handleSalesOrderView = async (orderId: string) => {
    setSalesOrderLoading(true);
    setSalesOrderModalOpen(true);
    setSalesOrderContent('');

    try {
      const response = await fetch(`/api/shipping-pdf/sales-order/${orderId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setSalesOrderContent(url);
      } else {
        setSalesOrderContent('');
        console.error('Failed to load sales order:', response.status);
      }
    } catch (error) {
      console.error('Error loading sales order:', error);
      setSalesOrderContent('');
    } finally {
      setSalesOrderLoading(false);
    }
  };

  // Group orders by technician and sort (memoized to prevent re-renders)
  const ordersByTechnician = useMemo(() => {
    const grouped = orders.reduce((acc: Record<string, any[]>, order: any) => {
      // Use the assigned technician from the database, or default to 'Unassigned' if empty
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
      toast.success(`Moved ${selectedOrders.size} orders to Paint`);
      setSelectedOrders(new Set());
      setSelectAllByTechnician({});
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department', 'Finish QC'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department', 'Paint'] });
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
            className="bg-green-600 hover:bg-green-700"
          >
            Good ({selectedOrders.size})
          </Button>
          
          <Button
            onClick={handleMoveToPaint}
            disabled={selectedOrders.size === 0 || moveToPaintMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Move to Paint ({selectedOrders.size})
          </Button>
          
          <Button
            onClick={() => toast.success('Test button clicked!')}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Test
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

      {/* Barcode Scanner */}
      <BarcodeScanner />

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
                                  <span className="font-medium text-sm truncate">
                                    {order.fbOrderNumber ? order.fbOrderNumber : order.orderId}
                                  </span>
                                  {order.fbOrderNumber && (
                                    <Badge variant="outline" className="text-xs px-1 py-0">
                                      {order.orderId}
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
                                
                                <div className="flex gap-1 flex-wrap">
                                  <Badge variant="secondary" className="text-xs px-1 py-0 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">
                                    {getTextureInfo(order)}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs px-1 py-0 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
                                    {getPaintColor(order)}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs px-1 py-0 border-blue-300 text-blue-700 dark:text-blue-300"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSalesOrderView(order.orderId);
                                    }}
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Badge>
                                  {hasKickbacks(order.orderId) && (
                                    <Badge
                                      variant="destructive"
                                      className={`cursor-pointer hover:opacity-80 transition-opacity text-xs px-1 py-0 ${
                                        getKickbackStatus(order.orderId) === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' :
                                        getKickbackStatus(order.orderId) === 'HIGH' ? 'bg-orange-600 hover:bg-orange-700' :
                                        getKickbackStatus(order.orderId) === 'MEDIUM' ? 'bg-yellow-600 hover:bg-yellow-700' :
                                        'bg-gray-600 hover:bg-gray-700'
                                      }`}
                                      onClick={() => handleKickbackClick(order.orderId)}
                                    >
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Kickback
                                    </Badge>
                                  )}
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

      {/* Sales Order Modal */}
      <Dialog open={salesOrderModalOpen} onOpenChange={(open) => {
        setSalesOrderModalOpen(open);
        if (!open && salesOrderContent) {
          // Clean up blob URL to prevent memory leaks
          URL.revokeObjectURL(salesOrderContent);
          setSalesOrderContent('');
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Sales Order</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {salesOrderLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <span className="ml-2">Loading sales order...</span>
              </div>
            ) : salesOrderContent ? (
              <div className="w-full h-[70vh]">
                <iframe 
                  src={salesOrderContent}
                  className="w-full h-full border-0"
                  title="Sales Order PDF"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <p className="text-gray-500">Failed to load sales order</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
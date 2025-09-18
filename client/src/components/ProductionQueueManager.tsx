import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  Package,
  ArrowRight,
  Scan
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

interface POItem {
  id: number;
  poid: number;
  ponumber: string;
  itemname: string;
  stockmodelid: string;
  stockmodelname: string;
  quantity: number;
  unitprice: string;
  totalprice: string;
  customername: string;
  duedate: string;
  ordercount: number; // Track how many units have been moved to production
  priorityScore: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

interface Kickback {
  id: number;
  orderId: string;
  department: string;
  issueDescription: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

interface WeekSchedule {
  week: number;
  dueDate: string;
  itemsToComplete: number;
  cumulativeItems: number;
}

interface ProductionSchedule {
  success: boolean;
  poNumber: string;
  finalDueDate: string;
  availableWeeks: number;
  totalItemsNeeded: number;
  totalItemsPerWeekRequired: number;
  overallFeasible: boolean;
  itemSchedules: {
    itemId: number;
    itemName: string;
    totalQuantity: number;
    itemsPerWeek: number;
    weeksNeeded: number;
    weeklySchedule: WeekSchedule[];
  }[];
}

// Hierarchical PO Selector Component
interface POHierarchicalSelectorProps {
  poItems: POItem[];
  onMoveToLayup: (selectedItems: { item: POItem; quantity: number }[]) => void;
}

function POHierarchicalSelector({ poItems, onMoveToLayup }: POHierarchicalSelectorProps) {
  const [selectedItems, setSelectedItems] = useState<Map<number, number>>(new Map());
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());

  // Group items by customer and PO number
  const groupedItems = poItems.reduce((acc, item) => {
    if (!acc[item.customername]) {
      acc[item.customername] = {};
    }
    if (!acc[item.customername][item.ponumber]) {
      acc[item.customername][item.ponumber] = [];
    }
    acc[item.customername][item.ponumber].push(item);
    return acc;
  }, {} as Record<string, Record<string, POItem[]>>);

  const handleItemQuantityChange = (itemId: number, quantity: number) => {
    const newSelectedItems = new Map(selectedItems);
    if (quantity > 0) {
      newSelectedItems.set(itemId, quantity);
    } else {
      newSelectedItems.delete(itemId);
    }
    setSelectedItems(newSelectedItems);
  };

  const toggleCustomer = (customerName: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerName)) {
      newExpanded.delete(customerName);
    } else {
      newExpanded.add(customerName);
    }
    setExpandedCustomers(newExpanded);
  };

  const togglePO = (poNumber: string) => {
    const newExpanded = new Set(expandedPOs);
    if (newExpanded.has(poNumber)) {
      newExpanded.delete(poNumber);
    } else {
      newExpanded.add(poNumber);
    }
    setExpandedPOs(newExpanded);
  };

  const handleMoveSelected = () => {
    const itemsToMove = Array.from(selectedItems.entries()).map(([itemId, quantity]) => {
      const item = poItems.find(item => item.id === itemId)!;
      return { item, quantity };
    });
    onMoveToLayup(itemsToMove);
    setSelectedItems(new Map());
  };

  const getUrgencyBadgeColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'critical': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high': return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default: return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  return (
    <div className="space-y-4">
      {/* Move Selected Button */}
      {selectedItems.size > 0 && (
        <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg border">
          <span className="text-sm font-medium">
            {selectedItems.size} items selected ({Array.from(selectedItems.values()).reduce((sum, qty) => sum + qty, 0)} total units)
          </span>
          <Button 
            onClick={handleMoveSelected}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Move to Layup Schedule
          </Button>
        </div>
      )}

      {/* Customer/PO/Items Hierarchy */}
      <div className="space-y-2">
        {Object.entries(groupedItems).map(([customerName, pos]) => (
          <Card key={customerName} className="border">
            <CardHeader 
              className="cursor-pointer hover:bg-gray-50 p-4"
              onClick={() => toggleCustomer(customerName)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-lg">{customerName}</span>
                  <Badge variant="secondary">
                    {Object.keys(pos).length} PO{Object.keys(pos).length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="text-gray-400">
                  {expandedCustomers.has(customerName) ? '▼' : '▶'}
                </div>
              </div>
            </CardHeader>
            
            {expandedCustomers.has(customerName) && (
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {Object.entries(pos).map(([poNumber, items]) => (
                    <Card key={poNumber} className="border-l-4 border-l-blue-500 bg-gray-50">
                      <CardHeader 
                        className="cursor-pointer hover:bg-gray-100 p-3"
                        onClick={() => togglePO(poNumber)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-green-600" />
                            <span className="font-medium">PO #{poNumber}</span>
                            <Badge variant="outline">
                              {items.length} item{items.length !== 1 ? 's' : ''}
                            </Badge>
                            <div className="text-sm text-gray-500">
                              Due: {new Date(items[0].duedate).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-gray-400">
                            {expandedPOs.has(poNumber) ? '▼' : '▶'}
                          </div>
                        </div>
                      </CardHeader>
                      
                      {expandedPOs.has(poNumber) && (
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {items.map((item) => {
                              const availableQuantity = item.quantity - (item.ordercount || 0);
                              const selectedQuantity = selectedItems.get(item.id) || 0;
                              
                              return (
                                <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded border">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{item.itemname}</span>
                                      <Badge variant="outline">{item.stockmodelname}</Badge>
                                      <Badge className={getUrgencyBadgeColor(item.urgencyLevel)}>
                                        {item.urgencyLevel.toUpperCase()}
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                      Available: {availableQuantity} / {item.quantity} units
                                      {item.ordercount > 0 && (
                                        <span className="ml-2">({item.ordercount} in production)</span>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      Due in {item.daysToDue} days
                                      {item.isOverdue && <span className="text-red-600 font-semibold ml-1">(OVERDUE)</span>}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={selectedQuantity.toString()}
                                      onValueChange={(value) => handleItemQuantityChange(item.id, parseInt(value))}
                                    >
                                      <SelectTrigger className="w-20">
                                        <SelectValue placeholder="0" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">0</SelectItem>
                                        {Array.from({ length: availableQuantity }, (_, i) => i + 1).map(num => (
                                          <SelectItem key={num} value={num.toString()}>
                                            {num}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <span className="text-sm text-gray-500">units</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ProductionQueueManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for week selection dialog
  const [selectedPOItem, setSelectedPOItem] = useState<POItem | null>(null);
  const [productionSchedule, setProductionSchedule] = useState<ProductionSchedule | null>(null);
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // State for order selection in regular production queue
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Fetch prioritized production queue
  const { data: productionQueue = [], isLoading, refetch } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Fetch P1 Purchase Order items ready for production
  const { data: poItems = [], isLoading: isLoadingPOItems, refetch: refetchPOItems } = useQuery<POItem[]>({
    queryKey: ['/api/production-queue/po-items'],
    queryFn: () => apiRequest('/api/production-queue/po-items'),
  });

  // Fetch orders that need attention (missing critical information for layup scheduling)
  const { data: attentionOrders = [], isLoading: isLoadingAttention, refetch: refetchAttention } = useQuery<any[]>({
    queryKey: ['/api/production-queue/attention'],
    queryFn: () => apiRequest('/api/production-queue/attention'),
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

  // Fetch production schedule for PO
  const fetchProductionScheduleMutation = useMutation({
    mutationFn: (poId: number) => 
      apiRequest(`/api/pos/${poId}/calculate-production-schedule`, {
        method: 'POST'
      }),
    onSuccess: (result: ProductionSchedule) => {
      setProductionSchedule(result);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Calculate Schedule",
        description: error.message || "Failed to calculate production schedule",
        variant: "destructive",
      });
    }
  });

  // Move selected weeks to layup scheduler mutation
  const moveWeeksToLayupMutation = useMutation({
    mutationFn: ({ poItem, weeks }: { poItem: POItem; weeks: number[] }) => 
      apiRequest('/api/production-queue/po-weeks-to-layup', {
        method: 'POST',
        body: JSON.stringify({ poItem, selectedWeeks: weeks })
      }),
    onSuccess: (result: any) => {
      toast({
        title: "Selected Weeks Moved to Layup",
        description: `Successfully moved ${selectedWeeks.length} weeks to layup scheduler`,
      });
      setIsDialogOpen(false);
      setSelectedPOItem(null);
      setSelectedWeeks([]);
      setProductionSchedule(null);
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/po-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Move Weeks",
        description: error.message || "Failed to move selected weeks to layup scheduler",
        variant: "destructive",
      });
    }
  });

  // Move selected PO items to layup scheduler mutation
  const moveSelectedItemsToLayupMutation = useMutation({
    mutationFn: (selectedItems: { item: POItem; quantity: number }[]) => 
      apiRequest('/api/production-queue/move-selected-po-items', {
        method: 'POST',
        body: JSON.stringify({ selectedItems })
      }),
    onSuccess: (result: any) => {
      toast({
        title: "Items Moved to Layup",
        description: `Successfully moved ${result.totalItemsMoved} items to layup scheduler`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/po-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Move Items",
        description: error.message || "Failed to move selected items to layup scheduler",
        variant: "destructive",
      });
    }
  });

  // Move selected orders to barcode department mutation
  const moveToBarcodeDepMutation = useMutation({
    mutationFn: (orderIds: string[]) => 
      apiRequest('/api/orders/progress-department', {
        method: 'POST',
        body: JSON.stringify({ 
          orderIds, 
          toDepartment: 'Barcode'
        })
      }),
    onSuccess: (result: any, orderIds: string[]) => {
      setSelectedOrders(new Set());
      setSelectAll(false);
      toast({
        title: "Success",
        description: `${orderIds.length} order(s) moved to Barcode department`,
      });
      // Invalidate multiple query keys as orders may affect different lists
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/attention'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/po-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error: any) => {
      console.error('Error progressing orders:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to progress orders to Barcode department",
        variant: "destructive"
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

  // Helper function to extract action length from order features
  // Based on LayupScheduler.tsx logic to ensure consistency
  const getActionLength = (order: ProductionQueueOrder) => {
    const orderFeatures = (order as any).features;
    if (!orderFeatures) return 'N/A';

    const modelId = order.stockModelId || order.modelId;
    const isAPR = modelId && modelId.toLowerCase().includes('apr');

    // For APR orders, show combined action length and action type (matching LayupScheduler)
    if (isAPR) {
      // Check for action_inlet field first (more specific)
      let actionType = orderFeatures.action_inlet;
      if (!actionType) {
        // Fallback to action field
        actionType = orderFeatures.action;
      }

      // Get action length for APR orders
      let actionLength = orderFeatures.action_length;
      if (!actionLength || actionLength === 'none') {
        // Try to derive from action_inlet
        if (actionType && actionType.includes('short')) actionLength = 'SA';
        else if (actionType && actionType.includes('long')) actionLength = 'LA';
        else actionLength = 'SA'; // Default for APR
      }

      // Convert action length to abbreviation
      const lengthMap: {[key: string]: string} = {
        'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
        'long': 'LA', 'medium': 'MA', 'short': 'SA',
        'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
      };

      const actionLengthAbbr = lengthMap[actionLength] || actionLength;

      if (!actionType || actionType === 'none') {
        // Show just action length if no action type
        return actionLengthAbbr;
      }

      // Convert common action types to readable format
      const actionMap: {[key: string]: string} = {
        'anti_ten_hunter_def': 'Anti-X Hunter',
        'apr': 'APR',
        'rem_700': 'Rem 700',
        'tikka': 'Tikka',
        'savage': 'Savage'
      };

      const actionDisplay = actionMap[actionType] || actionType.replace(/_/g, ' ').toUpperCase();

      // Combine action length and action type for APR orders
      return `${actionLengthAbbr} ${actionDisplay}`;
    }

    // For non-APR orders, show action length
    // Look for action_length field first
    let actionLengthValue = orderFeatures.action_length;

    // If action_length is empty or 'none', try to derive from action_inlet
    if ((!actionLengthValue || actionLengthValue === 'none') && orderFeatures.action_inlet) {
      const actionInlet = orderFeatures.action_inlet;
      
      // Map common action inlets to action lengths based on actual data patterns
      const inletToLengthMap: {[key: string]: string} = {
        'anti_ten_hunter_def': 'SA',
        'remington_700': 'SA',
        'remington_700_long': 'LA',
        'rem_700': 'SA',
        'rem_700_short': 'SA',
        'rem_700_long': 'LA',
        'tikka_t3': 'SA',
        'tikka_short': 'SA',
        'tikka_long': 'LA',
        'savage_short': 'SA',
        'savage_long': 'LA',
        'savage_110': 'LA',
        'winchester_70': 'LA',
        'howa_1500': 'SA',
        'bergara_b14': 'SA',
        'carbon_six_medium': 'MA'
      };

      actionLengthValue = inletToLengthMap[actionInlet] || 'SA';
    }

    if (!actionLengthValue || actionLengthValue === 'none') return 'N/A';

    // Simple abbreviation mapping
    const displayMap: {[key: string]: string} = {
      'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
      'long': 'LA', 'medium': 'MA', 'short': 'SA',
      'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
    };

    return displayMap[actionLengthValue] || actionLengthValue;
  };

  // Helper functions for order selection
  const handleOrderSelection = (orderId: string, isSelected: boolean) => {
    const newSelectedOrders = new Set(selectedOrders);
    if (isSelected) {
      newSelectedOrders.add(orderId);
    } else {
      newSelectedOrders.delete(orderId);
    }
    setSelectedOrders(newSelectedOrders);
    setSelectAll(newSelectedOrders.size === productionQueue.length);
  };

  const handleSelectAll = (isSelectAll: boolean) => {
    if (isSelectAll) {
      setSelectedOrders(new Set(productionQueue.map(order => order.orderId)));
    } else {
      setSelectedOrders(new Set());
    }
    setSelectAll(isSelectAll);
  };

  const handleMoveToBarcodeDepartment = () => {
    if (selectedOrders.size > 0) {
      moveToBarcodeDepMutation.mutate(Array.from(selectedOrders));
    }
  };

  const handleOpenWeekSelection = async (poItem: POItem) => {
    setSelectedPOItem(poItem);
    setIsDialogOpen(true);
    setSelectedWeeks([]);
    // Fetch production schedule for this PO
    await fetchProductionScheduleMutation.mutateAsync(poItem.poid);
  };

  const handleWeekToggle = (weekNumber: number) => {
    setSelectedWeeks(prev => 
      prev.includes(weekNumber) 
        ? prev.filter(w => w !== weekNumber)
        : [...prev, weekNumber].sort((a, b) => a - b)
    );
  };

  const handleMoveSelectedWeeks = () => {
    if (selectedPOItem && selectedWeeks.length > 0) {
      moveWeeksToLayupMutation.mutate({
        poItem: selectedPOItem,
        weeks: selectedWeeks
      });
    }
  };

  const handleMoveSelectedItemsToLayup = (selectedItems: { item: POItem; quantity: number }[]) => {
    if (selectedItems.length > 0) {
      moveSelectedItemsToLayupMutation.mutate(selectedItems);
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

  if (isLoading || isLoadingPOItems || isLoadingAttention) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading production queues...</div>
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

      <Accordion type="multiple" defaultValue={[]} className="space-y-4">
        {/* Orders That Need Attention */}
        <AccordionItem value="attention-orders">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Orders That Need Attention
                  {attentionOrders.length > 0 && (
                    <Badge className="bg-red-500 hover:bg-red-600 text-white ml-2">
                      {attentionOrders.length}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Orders missing critical information required for layup scheduling
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {attentionOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-300" />
                    <p>No orders requiring attention</p>
                    <p className="text-sm">All production issues are resolved</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Missing Items</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(attentionOrders) && attentionOrders.map((order) => (
                        <TableRow key={order.orderId} className="bg-amber-50">
                          <TableCell className="font-medium">
                            {order.orderId}
                          </TableCell>
                          <TableCell>
                            {order.customerName || order.customerId}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {order.modelId || 'Missing'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {order.missingItems?.map((item: string) => (
                                <Badge key={item} className="bg-red-500 hover:bg-red-600 text-white text-xs">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'Not set'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <ArrowRight className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* P1 Purchase Order Queue */}
        <AccordionItem value="po-queue">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  P1 Purchase Order Queue
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Priority queue for purchase order items - these will be scheduled first
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
          {poItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No PO items ready for production</p>
              <p className="text-sm">PO items with quantities will appear here for scheduling</p>
            </div>
          ) : (
            <POHierarchicalSelector 
              poItems={poItems} 
              onMoveToLayup={(selectedItems) => handleMoveSelectedItemsToLayup(selectedItems)}
            />
          )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Regular Production Queue */}
        <AccordionItem value="regular-queue">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Regular Production Queue
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Ready for layup orders - these will fill remaining schedule slots
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
          {productionQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No orders in production queue</p>
              <p className="text-sm">Use Auto-Populate to add eligible orders</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Multi-select Actions */}
              {selectedOrders.size > 0 && (
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-blue-800 dark:text-blue-200">
                          {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected for progression
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrders(new Set())}
                          disabled={moveToBarcodeDepMutation.isPending}
                          data-testid="button-clear-selection"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleMoveToBarcodeDepartment}
                          disabled={moveToBarcodeDepMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                          data-testid="button-progress-barcode"
                        >
                          <Scan className="w-4 h-4 mr-2" />
                          {moveToBarcodeDepMutation.isPending ? 'Moving...' : 'Progress to Barcode Department →'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectAll}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-20">Priority</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Stock Model</TableHead>
                    <TableHead>Action Length</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days to Due</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionQueue.map((order, index) => (
                    <TableRow 
                      key={order.orderId} 
                      className={`${order.isOverdue ? 'bg-red-50' : ''} ${selectedOrders.has(order.orderId) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedOrders.has(order.orderId)}
                          onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                          data-testid={`checkbox-order-${order.orderId}`}
                        />
                      </TableCell>
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
                        <Badge variant="secondary" data-testid={`text-action-length-${order.orderId}`}>
                          {getActionLength(order)}
                        </Badge>
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
            </div>
          )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      {/* Week Selection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Weeks for Production Schedule</DialogTitle>
          </DialogHeader>
          
          {selectedPOItem && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">{selectedPOItem.itemname}</h4>
                <p className="text-sm text-gray-600">PO #{selectedPOItem.ponumber} - {selectedPOItem.quantity} units</p>
                <p className="text-sm text-gray-600">Customer: {selectedPOItem.customername}</p>
              </div>

              {fetchProductionScheduleMutation.isPending && (
                <div className="text-center py-4">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p>Calculating production schedule...</p>
                </div>
              )}

              {productionSchedule && productionSchedule.itemSchedules.length > 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p>Total weeks needed: {productionSchedule.itemSchedules[0].weeksNeeded}</p>
                    <p>Items per week: {productionSchedule.itemSchedules[0].itemsPerWeek}</p>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium">Select weeks to move to layup scheduler:</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                      {productionSchedule.itemSchedules[0].weeklySchedule.map((week) => (
                        <div
                          key={week.week}
                          className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50"
                        >
                          <Checkbox
                            id={`week-${week.week}`}
                            checked={selectedWeeks.includes(week.week)}
                            onCheckedChange={() => handleWeekToggle(week.week)}
                          />
                          <label
                            htmlFor={`week-${week.week}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <div className="font-medium">Week {week.week}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(week.dueDate).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-blue-600">
                              {week.itemsToComplete} units
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedWeeks.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-blue-800">
                        Selected: {selectedWeeks.length} weeks
                      </p>
                      <p className="text-xs text-blue-600">
                        Total units: {selectedWeeks.reduce((total, weekNum) => {
                          const week = productionSchedule.itemSchedules[0].weeklySchedule.find(w => w.week === weekNum);
                          return total + (week?.itemsToComplete || 0);
                        }, 0)}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleMoveSelectedWeeks}
                      disabled={selectedWeeks.length === 0 || moveWeeksToLayupMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {moveWeeksToLayupMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          Moving...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Move Selected to Layup
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      disabled={moveWeeksToLayupMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
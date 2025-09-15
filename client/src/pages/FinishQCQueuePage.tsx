import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Shield, ArrowLeft, ArrowRight, Search, CheckSquare, Square } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import FBNumberSearch from '@/components/FBNumberSearch';
import { toast } from 'react-hot-toast';

export default function FinishQCQueuePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Finish QC department
  const finishQCOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish' || 
      order.currentDepartment === 'FinishQC' ||
      (order.department === 'Finish' && order.status === 'IN_PROGRESS')
    );
  }, [allOrders]);

  // Filter orders based on search query
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return finishQCOrders;
    
    const query = searchQuery.toLowerCase().trim();
    return finishQCOrders.filter((order: any) => {
      const orderId = order.orderId?.toLowerCase() || '';
      const fbNumber = order.fbOrderNumber?.toLowerCase() || '';
      const displayOrderId = getDisplayOrderId(order.orderId)?.toLowerCase() || '';
      
      return orderId.includes(query) || 
             fbNumber.includes(query) || 
             displayOrderId.includes(query);
    });
  }, [finishQCOrders, searchQuery]);

  // Count orders in previous department (CNC)
  const cncCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC' || 
      (order.department === 'CNC' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count orders in next department (Paint)
  const paintCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Paint' || 
      (order.department === 'Paint' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Handle order found via Facebook number search
  const handleOrderFound = (orderId: string) => {
    // Check if the order exists in the current Finish QC queue
    const orderExists = finishQCOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      // Select the found order
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast.success(`Order ${orderId} found and selected in Finish QC department`);
    } else {
      // Find the order in all orders to show current department
      const allOrder = (allOrders as any[]).find((order: any) => order.orderId === orderId);
      if (allOrder) {
        toast.error(`Order ${orderId} is currently in ${allOrder.currentDepartment} department, not Finish QC`);
      } else {
        toast.error(`Order ${orderId} not found`);
      }
    }
  };

  // Handle individual order selection
  const handleOrderSelect = (orderId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (isSelected) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
    }
    setSelectedOrders(newSelected);
    setSelectAll(newSelected.size === filteredOrders.length && filteredOrders.length > 0);
  };

  // Handle select all toggle
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map((order: any) => order.orderId)));
    }
    setSelectAll(!selectAll);
  };

  // Handle search with auto-selection
  const handleSearchWithSelection = (query: string) => {
    setSearchQuery(query);
    
    if (query.trim()) {
      // Auto-select matching orders after a short delay
      setTimeout(() => {
        const matchingOrderIds = filteredOrders.map((order: any) => order.orderId);
        if (matchingOrderIds.length > 0) {
          setSelectedOrders(new Set(matchingOrderIds));
          toast.success(`${matchingOrderIds.length} matching order(s) selected`);
        }
      }, 300);
    }
  };

  // Update select all state when filtered orders change
  React.useEffect(() => {
    setSelectAll(selectedOrders.size === filteredOrders.length && filteredOrders.length > 0);
  }, [selectedOrders.size, filteredOrders.length]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Finish QC Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Search Box */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="search-input">Search by Order ID or FishBowl Number</Label>
            <div className="flex gap-2">
              <Input
                id="search-input"
                type="text"
                placeholder="Enter Order ID (e.g., AG123) or FB Number (e.g., AK072)..."
                value={searchQuery}
                onChange={(e) => handleSearchWithSelection(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (searchQuery.trim()) {
                    const matchingOrderIds = filteredOrders.map((order: any) => order.orderId);
                    setSelectedOrders(new Set(matchingOrderIds));
                    toast.success(`${matchingOrderIds.length} matching order(s) selected`);
                  }
                }}
                disabled={!searchQuery.trim() || filteredOrders.length === 0}
              >
                Select Matches
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facebook Number Search */}
      <FBNumberSearch onOrderFound={handleOrderFound} />

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
              <ArrowRight className="h-5 w-5" />
              Paint
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

      {/* Current Department Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span>Finish QC Department Manager</span>
              {filteredOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-gray-600">
                    Select All ({selectedOrders.size} selected)
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {searchQuery && (
                <Badge variant="secondary" className="ml-2">
                  {filteredOrders.length} of {finishQCOrders.length} shown
                </Badge>
              )}
              {selectedOrders.size > 0 && (
                <Badge variant="default" className="bg-blue-600">
                  {selectedOrders.size} Selected
                </Badge>
              )}
              <Badge variant="outline" className="ml-2">
                {finishQCOrders.length} Total Orders
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? `No orders found matching "${searchQuery}"` : "No orders in Finish QC queue"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredOrders.map((order: any) => {
                const isSelected = selectedOrders.has(order.orderId);
                return (
                  <div key={order.orderId} className="relative">
                    <div 
                      className={`transition-all duration-200 ${
                        isSelected 
                          ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50 dark:bg-blue-900/20' 
                          : 'hover:ring-1 hover:ring-gray-300'
                      }`}
                    >
                      <OrderTooltip 
                        order={order} 
                        stockModels={stockModels} 
                        className={`border-l-purple-500 cursor-pointer ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      />
                    </div>
                    <div className="absolute top-2 right-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleOrderSelect(order.orderId, checked as boolean)}
                        data-testid={`checkbox-order-${order.orderId}`}
                        className="bg-white dark:bg-gray-800 border-2"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
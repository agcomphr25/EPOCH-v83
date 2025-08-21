import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ShippingActions } from '@/components/ShippingActions';
import { BulkShippingActions } from '@/components/BulkShippingActions';
import UPSLabelCreator from '@/components/UPSLabelCreator';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, ArrowLeft, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

import { fetchPdf, downloadPdf } from '@/utils/pdfUtils';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function ShippingQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showLabelCreator, setShowLabelCreator] = useState(false);
  const [labelData, setLabelData] = useState<any>(null);
  const [showLabelViewer, setShowLabelViewer] = useState(false);
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [shippingDetails, setShippingDetails] = useState({
    weight: '10',
    length: '12',
    width: '12', 
    height: '12',
    value: '500',
    billingOption: 'sender', // 'sender', 'receiver', 'third_party'
    receiverAccount: {
      accountNumber: '',
      zipCode: ''
    },
    address: {
      name: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US'
    }
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get all orders from production pipeline with payment status
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/with-payment-status'],
  });

  // Mutation to fulfill orders and move to shipping management
  const fulfillOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('/api/orders/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
    },
    onSuccess: (_, orderId) => {
      toast({
        title: "Order Fulfilled",
        description: `Order ${orderId} has been marked as fulfilled and moved to shipping management`,
      });
      // Invalidate and refetch orders to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      setSelectedCard(null);
      setSelectedOrders([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error fulfilling order",
        description: error.message || "Failed to fulfill order",
        variant: "destructive"
      });
    }
  });

  // Get orders in Shipping department, categorized by due date
  const shippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter((order: any) => 
      order.currentDepartment === 'Shipping' || 
      (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );
    
    // Sort by due date - most urgent first
    return filteredOrders.sort((a: any, b: any) => {
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return dateA - dateB; // Earliest due date first (most urgent)
    });
  }, [allOrders]);

  // Categorize orders by due date
  const categorizedOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const overdue: any[] = [];
    const dueToday: any[] = [];
    const dueTomorrow: any[] = [];
    const dueThisWeek: any[] = [];
    const dueLater: any[] = [];

    shippingOrders.forEach((order: any) => {
      if (!order.dueDate) {
        dueLater.push(order);
        return;
      }

      const dueDate = new Date(order.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        overdue.push(order);
      } else if (dueDate.getTime() === today.getTime()) {
        dueToday.push(order);
      } else if (dueDate.getTime() === tomorrow.getTime()) {
        dueTomorrow.push(order);
      } else if (dueDate <= nextWeek) {
        dueThisWeek.push(order);
      } else {
        dueLater.push(order);
      }
    });

    return {
      overdue,
      dueToday,
      dueTomorrow,
      dueThisWeek,
      dueLater
    };
  }, [shippingOrders]);

  // Count orders in previous department (Shipping QC)
  const shippingQCCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.currentDepartment === 'QC' || 
      (order.department === 'QC' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Get customers data for address information
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Get unique customer IDs from shipping orders for address lookup
  const uniqueCustomerIds = useMemo(() => {
    const orders = allOrders as any[];
    const shippingOrdersList = orders.filter((order: any) => 
      order.currentDepartment === 'Shipping' || 
      (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );
    return Array.from(new Set(shippingOrdersList.map(order => order.customerId).filter(Boolean)));
  }, [allOrders]);

  // Fetch customer addresses for all shipping orders at once
  const { data: customerAddressesMap = {} } = useQuery({
    queryKey: ['/api/customers/addresses', uniqueCustomerIds],
    queryFn: async () => {
      const addressMap: Record<string, any> = {};
      
      // Fetch addresses for each unique customer ID
      await Promise.all(
        uniqueCustomerIds.map(async (customerId: string) => {
          try {
            const response = await fetch(`/api/customers/${customerId}/addresses`);
            if (response.ok) {
              const addresses = await response.json();
              addressMap[customerId] = addresses;
            }
          } catch (error) {
            console.error(`Failed to fetch addresses for customer ${customerId}:`, error);
          }
        })
      );
      
      return addressMap;
    },
    enabled: uniqueCustomerIds.length > 0,
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const models = stockModels as any[];
    const model = models.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const getCustomerInfo = (customerId: string) => {
    const customerList = customers as any[];
    return customerList.find((c: any) => c.id.toString() === customerId.toString());
  };

  const getCustomerAddress = (customerId: string) => {
    const addressList = customerAddressesMap[customerId] || [];
    
    // Find default shipping address
    let address = addressList.find((a: any) => 
      a.type === 'shipping' && a.isDefault
    );
    
    // Fallback to any 'both' type default address
    if (!address) {
      address = addressList.find((a: any) => 
        a.type === 'both' && a.isDefault
      );
    }
    
    // Fallback to any default address
    if (!address) {
      address = addressList.find((a: any) => a.isDefault);
    }
    
    // Fallback to first address for this customer
    if (!address && addressList.length > 0) {
      address = addressList[0];
    }
    
    return address;
  };

  const handleOrderSelection = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedOrders(prev => [...prev, orderId]);
    } else {
      setSelectedOrders(prev => prev.filter(id => id !== orderId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(shippingOrders.map(order => order.orderId));
    } else {
      setSelectedOrders([]);
    }
  };

  const clearSelection = () => {
    setSelectedOrders([]);
  };

  const handleCardSelection = (orderId: string) => {
    setSelectedCard(selectedCard === orderId ? null : orderId);
  };

  const getSelectedOrder = () => {
    if (!selectedCard) return null;
    return shippingOrders.find(order => order.orderId === selectedCard);
  };

  const handleQCChecklistDownload = async () => {
    // Check for selected order - either from card selection or checkbox selection
    let targetOrder = null;
    let orderId = '';

    if (selectedCard) {
      // Use card selection if available
      targetOrder = getSelectedOrder();
      orderId = selectedCard;
    } else if (selectedOrders.length === 1) {
      // Use single checkbox selection if only one order is selected
      orderId = selectedOrders[0];
      targetOrder = shippingOrders.find(order => order.orderId === orderId);
    } else {
      toast({
        title: "No order selected",
        description: "Please select a single order by clicking on it or checking one checkbox",
        variant: "destructive"
      });
      return;
    }

    if (!targetOrder) {
      toast({
        title: "Order not found",
        description: "Selected order not found in shipping queue",
        variant: "destructive"
      });
      return;
    }

    try {
      toast({
        title: "Generating QC checklist...",
        description: "Please wait while we generate the PDF"
      });

      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');
      
      toast({
        title: "QC checklist opened",
        description: `QC checklist for order ${orderId} opened in new tab for printing`
      });
    } catch (error) {
      console.error('Error generating QC checklist:', error);
      toast({
        title: "Error generating QC checklist",
        description: "Failed to generate QC checklist PDF",
        variant: "destructive"
      });
    }
  };

  const handleSalesOrderDownload = async () => {
    // Check for selected order - either from card selection or checkbox selection
    let targetOrder = null;
    let orderId = '';

    if (selectedCard) {
      // Use card selection if available
      targetOrder = getSelectedOrder();
      orderId = selectedCard;
    } else if (selectedOrders.length === 1) {
      // Use single checkbox selection if only one order is selected
      orderId = selectedOrders[0];
      targetOrder = shippingOrders.find(order => order.orderId === orderId);
    } else {
      toast({
        title: "No order selected",
        description: "Please select a single order by clicking on it or checking one checkbox",
        variant: "destructive"
      });
      return;
    }

    if (!targetOrder) {
      toast({
        title: "Order not found",
        description: "Selected order not found in shipping queue",
        variant: "destructive"
      });
      return;
    }

    try {
      toast({
        title: "Generating sales order invoice...",
        description: "Please wait while we generate the PDF"
      });

      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');
      
      toast({
        title: "Sales order invoice opened",
        description: `Sales order invoice for ${orderId} opened in new tab for printing`
      });
    } catch (error) {
      console.error('Error generating sales order:', error);
      toast({
        title: "Error generating sales order",
        description: "Failed to generate sales order PDF",
        variant: "destructive"
      });
    }
  };

  const handleShippingLabelCreator = async () => {
    // Check for selected order - either from card selection or checkbox selection
    let targetOrder = null;
    let orderId = '';

    if (selectedCard) {
      // Use card selection if available
      targetOrder = getSelectedOrder();
      orderId = selectedCard;
    } else if (selectedOrders.length === 1) {
      // Use single checkbox selection if only one order is selected
      orderId = selectedOrders[0];
      targetOrder = shippingOrders.find(order => order.orderId === orderId);
    } else {
      toast({
        title: "No order selected",
        description: "Please select a single order by clicking on it or checking one checkbox",
        variant: "destructive"
      });
      return;
    }

    if (!targetOrder) {
      toast({
        title: "Order not found",
        description: "Selected order not found in shipping queue",
        variant: "destructive"
      });
      return;
    }

    // Pre-populate shipping address from customer data
    const customerInfo = getCustomerInfo(targetOrder.customerId);
    const customerAddress = getCustomerAddress(targetOrder.customerId);
    
    if (customerAddress && customerInfo) {
      setShippingDetails(prev => ({
        ...prev,
        address: {
          name: customerInfo.name || '',
          street: customerAddress.street || '',
          city: customerAddress.city || '',
          state: customerAddress.state || '',
          zip: customerAddress.zipCode || '',
          country: customerAddress.country === 'United States' ? 'US' : customerAddress.country || 'US'
        }
      }));
    }

    setSelectedOrderId(orderId);
    setShowShippingDialog(true);
  };

  // Handle successful label creation
  const handleLabelSuccess = (data: any) => {
    setLabelData(data);
    setShowLabelViewer(true);
    setShowLabelCreator(false);
    
    toast({
      title: "Shipping Label Generated",
      description: `Label created with tracking number: ${data.trackingNumber}`,
    });
  };

  // Generate shipping label with UPS API
  const generateShippingLabel = async () => {
    if (!selectedOrderId) return;
    
    try {
      const response = await fetch('/api/ups/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderId,
          shipTo: shippingDetails.address,
          packageDetails: {
            weight: parseFloat(shippingDetails.weight),
            dimensions: {
              length: parseFloat(shippingDetails.length),
              width: parseFloat(shippingDetails.width),
              height: parseFloat(shippingDetails.height)
            },
            declaredValue: parseFloat(shippingDetails.value)
          },
          billingOption: shippingDetails.billingOption,
          receiverAccount: shippingDetails.billingOption === 'receiver' ? shippingDetails.receiverAccount : undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate shipping label');
      }

      const labelData = await response.json();
      setLabelData(labelData);
      setShowShippingDialog(false);
      setShowLabelViewer(true);
      
      toast({
        title: "Shipping Label Generated",
        description: `Label created with tracking number: ${labelData.trackingNumber}`,
      });
    } catch (error) {
      console.error('Error generating label:', error);
      toast({
        title: "Error",
        description: "Failed to generate shipping label. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Download label function
  const downloadLabel = (labelBase64: string, trackingNumber: string, orderId: string) => {
    const link = document.createElement('a');
    link.href = `data:image/gif;base64,${labelBase64}`;
    link.download = `UPS_Label_${orderId}_${trackingNumber}.gif`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Bulk Shipping Actions */}
      {selectedOrders.length > 0 && (
        <BulkShippingActions 
          selectedOrders={selectedOrders} 
          onClearSelection={clearSelection}
          shippingOrders={shippingOrders}
        />
      )}

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Shipping QC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {shippingQCCount}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

        {/* Current Department Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {shippingOrders.length}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders ready for shipping
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Orders List - Categorized by Due Date */}
      <div className="space-y-6">
        {/* Header Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Shipping Queue ({shippingOrders.length} orders)</CardTitle>
              {shippingOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedOrders.length === shippingOrders.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {shippingOrders.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <div className="text-lg font-medium mb-2">No orders in shipping queue</div>
                <div className="text-sm">Orders will appear here when they're ready for shipping</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Overdue Orders */}
            {categorizedOrders.overdue.length > 0 && (
              <Card className="border-red-200 bg-red-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-red-700 text-sm font-medium flex items-center gap-2">
                    🚨 Overdue ({categorizedOrders.overdue.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3">
                    {categorizedOrders.overdue.map((order: any) => renderOrderCard(order))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Due Today */}
            {categorizedOrders.dueToday.length > 0 && (
              <Card className="border-orange-200 bg-orange-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-orange-700 text-sm font-medium flex items-center gap-2">
                    ⏰ Due Today ({categorizedOrders.dueToday.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3">
                    {categorizedOrders.dueToday.map((order: any) => renderOrderCard(order))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Due Tomorrow */}
            {categorizedOrders.dueTomorrow.length > 0 && (
              <Card className="border-yellow-200 bg-yellow-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-yellow-700 text-sm font-medium flex items-center gap-2">
                    📅 Due Tomorrow ({categorizedOrders.dueTomorrow.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3">
                    {categorizedOrders.dueTomorrow.map((order: any) => renderOrderCard(order))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Due This Week */}
            {categorizedOrders.dueThisWeek.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-blue-700 text-sm font-medium flex items-center gap-2">
                    📋 Due This Week ({categorizedOrders.dueThisWeek.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3">
                    {categorizedOrders.dueThisWeek.map((order: any) => renderOrderCard(order))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Due Later */}
            {categorizedOrders.dueLater.length > 0 && (
              <Card className="border-gray-200 bg-gray-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gray-700 text-sm font-medium flex items-center gap-2">
                    📦 Due Later ({categorizedOrders.dueLater.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3">
                    {categorizedOrders.dueLater.map((order: any) => renderOrderCard(order))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Function to render individual order cards
  function renderOrderCard(order: any) {
    const isSelected = selectedCard === order.orderId;
    const modelId = order.stockModelId || order.modelId;
    const materialType = order.features?.material_type;
    const customerInfo = getCustomerInfo(order.customerId);
    const customerAddress = getCustomerAddress(order.customerId);
    
    return (
      <Card 
        key={order.orderId}
        className={`hover:shadow-md transition-all cursor-pointer ${
          isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md' 
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => handleCardSelection(order.orderId)}
      >
        <CardContent className="p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedOrders.includes(order.orderId)}
                onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                onClick={(e) => e.stopPropagation()} // Prevent card selection when clicking checkbox
              />
              <div className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>
                {getDisplayOrderId(order)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {order.isFullyPaid ? (
                <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
                  PAID
                </Badge>
              ) : (
                <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                  NOT PAID
                </Badge>
              )}
              {materialType && (
                <Badge variant="secondary" className="text-xs">
                  {materialType}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Order Info */}
            <div className="space-y-1 text-sm">
              <div className="text-gray-600">
                <span className="font-medium">Customer:</span> {customerInfo?.name || order.customer}
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Model:</span> {getModelDisplayName(modelId)}
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Order Date:</span> {format(new Date(order.orderDate), 'MMM dd, yyyy')}
              </div>
              {order.dueDate && (
                <div className="text-gray-600">
                  <span className="font-medium">Due Date:</span> {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div className="space-y-1 text-sm">
              <div className="font-medium text-gray-700 mb-1">Shipping Address:</div>
              {customerAddress ? (
                <div className="text-gray-600 space-y-1">
                  <div className="font-medium">{customerInfo?.name || 'Customer'}</div>
                  {customerInfo?.phone && (
                    <div className="text-blue-600">{customerInfo.phone}</div>
                  )}
                  <div>{customerAddress.street}</div>
                  {customerAddress.street2 && <div>{customerAddress.street2}</div>}
                  <div>{customerAddress.city}, {customerAddress.state} {customerAddress.zipCode}</div>
                  {customerAddress.country !== 'United States' && (
                    <div>{customerAddress.country}</div>
                  )}
                </div>
              ) : (
                <div className="text-red-500 text-xs">
                  ⚠️ No shipping address found
                </div>
              )}
            </div>
          </div>
          
          {/* Quick Action Buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCard(order.orderId);
                setTimeout(() => handleSalesOrderDownload(), 100);
              }}
              className="flex-1 text-xs h-8"
            >
              📋 Sales Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCard(order.orderId);
                setTimeout(() => handleShippingLabelCreator(), 100);
              }}
              className="flex-1 text-xs h-8"
            >
              📦 Ship Label
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                fulfillOrderMutation.mutate(order.orderId);
              }}
              disabled={fulfillOrderMutation.isPending}
              className="flex-1 text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              {fulfillOrderMutation.isPending ? 'Fulfilling...' : 'Fulfilled'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Bottom Action Panel - Always visible at bottom of page
  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-3">
          <Package className="h-7 w-7 text-green-600" />
          Shipping Department
        </h1>

        {/* Barcode Scanner */}
        <div className="mb-6">
          <BarcodeScanner />
        </div>

        {/* Bulk Actions */}
        {selectedOrders.length > 0 && (
          <div className="mb-6">
            <BulkShippingActions 
              selectedOrders={selectedOrders}
              onClearSelection={() => setSelectedOrders([])}
              shippingOrders={shippingOrders}
            />
          </div>
        )}

        {/* Department Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Previous Department Count */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <ArrowLeft className="h-5 w-5" />
                Shipping QC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {shippingQCCount}
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                Orders in previous department
              </p>
            </CardContent>
          </Card>

          {/* Current Department Count */}
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Shipping
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {shippingOrders.length}
              </div>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Orders ready for shipping
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Orders List - Categorized by Due Date */}
        <div className="space-y-6">
          {/* Header Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>Shipping Queue ({shippingOrders.length} orders)</CardTitle>
                {shippingOrders.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedOrders.length === shippingOrders.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm text-gray-600">Select All</span>
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>

          {shippingOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <div className="text-lg font-medium mb-2">No orders in shipping queue</div>
                  <div className="text-sm">Orders will appear here when they're ready for shipping</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Overdue Orders */}
              {categorizedOrders.overdue.length > 0 && (
                <Card className="border-red-200 bg-red-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-red-700 text-sm font-medium flex items-center gap-2">
                      🚨 Overdue ({categorizedOrders.overdue.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {categorizedOrders.overdue.map((order: any) => renderOrderCard(order))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Due Today */}
              {categorizedOrders.dueToday.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-orange-700 text-sm font-medium flex items-center gap-2">
                      ⏰ Due Today ({categorizedOrders.dueToday.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {categorizedOrders.dueToday.map((order: any) => renderOrderCard(order))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Due Tomorrow */}
              {categorizedOrders.dueTomorrow.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-yellow-700 text-sm font-medium flex items-center gap-2">
                      📅 Due Tomorrow ({categorizedOrders.dueTomorrow.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {categorizedOrders.dueTomorrow.map((order: any) => renderOrderCard(order))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Due This Week */}
              {categorizedOrders.dueThisWeek.length > 0 && (
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-blue-700 text-sm font-medium flex items-center gap-2">
                      📋 Due This Week ({categorizedOrders.dueThisWeek.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {categorizedOrders.dueThisWeek.map((order: any) => renderOrderCard(order))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Due Later */}
              {categorizedOrders.dueLater.length > 0 && (
                <Card className="border-gray-200 bg-gray-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-700 text-sm font-medium flex items-center gap-2">
                      📦 Due Later ({categorizedOrders.dueLater.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {categorizedOrders.dueLater.map((order: any) => renderOrderCard(order))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Bottom Action Panel - Always visible at bottom of page */}
        <div className="mt-8">
          <Card className="bg-gray-50 dark:bg-gray-800">
            <CardContent className="p-6">
              {selectedCard ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-blue-600">
                        Selected Order: {getDisplayOrderId(getSelectedOrder())}
                      </div>
                      <div className="text-sm text-gray-600">
                        Customer: {getSelectedOrder()?.customer}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCard(null)}
                      className="text-gray-500 hover:text-gray-700 text-xl px-2 py-1 hover:bg-gray-200 rounded"
                    >
                      ×
                    </button>
                  </div>
                  
                  {/* Shipping Actions for Selected Order */}
                  <ShippingActions orderId={selectedCard || ''} orderData={getSelectedOrder()} />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg font-medium mb-2">Select an order to print shipping documents</div>
                  <div className="text-sm">Click on any order card above to see available printing options</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* UPS Label Creator Dialog */}
      {showLabelCreator && selectedOrderId && (
        <UPSLabelCreator
          orderId={selectedOrderId || ''}
          isOpen={showLabelCreator}
          onClose={() => {
            setShowLabelCreator(false);
            setSelectedOrderId(null);
          }}
          onSuccess={handleLabelSuccess}
        />
      )}

      {/* Shipping Details Dialog */}
      <Dialog open={showShippingDialog} onOpenChange={setShowShippingDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Shipping Details for Order {selectedOrderId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Billing Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Billing Options</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="bill-sender"
                    name="billing"
                    checked={shippingDetails.billingOption === 'sender'}
                    onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'sender' }))}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="bill-sender">Bill to Sender (Our Account)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="bill-receiver"
                    name="billing"
                    checked={shippingDetails.billingOption === 'receiver'}
                    onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'receiver' }))}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="bill-receiver">Bill to Receiver</Label>
                </div>
                
                {/* Receiver Account Details */}
                {shippingDetails.billingOption === 'receiver' && (
                  <div className="ml-6 space-y-3 p-4 bg-blue-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="receiver-account">UPS Account Number</Label>
                        <Input
                          id="receiver-account"
                          value={shippingDetails.receiverAccount.accountNumber}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, accountNumber: e.target.value }
                          }))}
                          placeholder="1234567890"
                        />
                      </div>
                      <div>
                        <Label htmlFor="receiver-zip">Account ZIP Code</Label>
                        <Input
                          id="receiver-zip"
                          value={shippingDetails.receiverAccount.zipCode}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, zipCode: e.target.value }
                          }))}
                          placeholder="12345"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-blue-600">
                      The receiver's UPS account will be charged for shipping costs.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Package Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Package Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input
                    id="weight"
                    type="number"
                    value={shippingDetails.weight}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div>
                  <Label htmlFor="value">Declared Value ($)</Label>
                  <Input
                    id="value"
                    type="number"
                    value={shippingDetails.value}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, value: e.target.value }))}
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="length">Length (in)</Label>
                  <Input
                    id="length"
                    type="number"
                    value={shippingDetails.length}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, length: e.target.value }))}
                    placeholder="12"
                  />
                </div>
                <div>
                  <Label htmlFor="width">Width (in)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={shippingDetails.width}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, width: e.target.value }))}
                    placeholder="12"
                  />
                </div>
                <div>
                  <Label htmlFor="height">Height (in)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={shippingDetails.height}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, height: e.target.value }))}
                    placeholder="12"
                  />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Shipping Address</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={shippingDetails.address.name}
                    onChange={(e) => setShippingDetails(prev => ({ 
                      ...prev, 
                      address: { ...prev.address, name: e.target.value }
                    }))}
                    placeholder="Customer Name"
                  />
                </div>
                <div>
                  <Label htmlFor="street">Street Address</Label>
                  <Input
                    id="street"
                    value={shippingDetails.address.street}
                    onChange={(e) => setShippingDetails(prev => ({ 
                      ...prev, 
                      address: { ...prev.address, street: e.target.value }
                    }))}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={shippingDetails.address.city}
                      onChange={(e) => setShippingDetails(prev => ({ 
                        ...prev, 
                        address: { ...prev.address, city: e.target.value }
                      }))}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={shippingDetails.address.state}
                      onChange={(e) => setShippingDetails(prev => ({ 
                        ...prev, 
                        address: { ...prev.address, state: e.target.value }
                      }))}
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input
                      id="zip"
                      value={shippingDetails.address.zip}
                      onChange={(e) => setShippingDetails(prev => ({ 
                        ...prev, 
                        address: { ...prev.address, zip: e.target.value }
                      }))}
                      placeholder="12345"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowShippingDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={generateShippingLabel}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Generate Label
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Label Viewer Dialog */}
      {showLabelViewer && labelData && (
        <Dialog open={showLabelViewer} onOpenChange={setShowLabelViewer}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Shipping Label Generated</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-sm"><strong>Tracking Number:</strong> {labelData.trackingNumber}</p>
                <p className="text-sm"><strong>Service:</strong> {labelData.serviceDescription}</p>
                <p className="text-sm"><strong>Cost:</strong> ${labelData.totalCharges}</p>
              </div>
              {labelData.labelImageFormat && (
                <div className="text-center">
                  <Button
                    onClick={() => {
                      // Open label in new popup for printing
                      const newWindow = window.open('', '_blank', 'width=800,height=600');
                      if (newWindow) {
                        newWindow.document.write(`
                          <html>
                            <head><title>UPS Shipping Label</title></head>
                            <body style="margin:0; padding:20px; text-align:center;">
                              <img src="data:image/gif;base64,${labelData.graphicImage}" style="max-width:100%;" />
                              <br><br>
                              <button onclick="window.print()">Print Label</button>
                            </body>
                          </html>
                        `);
                        newWindow.document.close();
                      }
                    }}
                    className="mb-4"
                  >
                    Print Label
                  </Button>
                  <div className="border rounded-lg p-4 bg-white">
                    <img 
                      src={`data:image/gif;base64,${labelData.graphicImage}`}
                      alt="Shipping Label"
                      className="mx-auto max-w-full h-auto"
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
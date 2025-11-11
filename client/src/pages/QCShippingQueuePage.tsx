import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  TrendingUp,
  ArrowLeft,
  CheckCircle,
  ArrowRight,
  FileText,
  Calendar,
  Truck,
  DollarSign,
  Package,
  AlertTriangle,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import UPSLabelCreator from '@/components/UPSLabelCreator';
import { apiRequest } from '@/lib/queryClient';
import { format, differenceInDays } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { OrderSearchBox } from '@/components/OrderSearchBox';
import { SalesOrderModal } from '@/components/SalesOrderModal';

export default function QCShippingQueuePage() {
  // State for tab selection
  const [activeTab, setActiveTab] = useState<string>('regular');
  
  // State for selected orders and shipping functionality
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showLabelCreator, setShowLabelCreator] = useState(false);
  const [labelData, setLabelData] = useState<any>(null);
  const [showLabelViewer, setShowLabelViewer] = useState(false);
  
  // State for PO order selection (customer-level selection)
  const [selectedPOItems, setSelectedPOItems] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  
  // State for shipment confirmation modal
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipmentProcessing, setShipmentProcessing] = useState(false);
  const [shipmentResult, setShipmentResult] = useState<any>(null);
  const [weightPerItem, setWeightPerItem] = useState(5);

  // State for bulk printing modal
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [printQueue, setPrintQueue] = useState<
    { orderId: string; type: 'sales' | 'qc' }[]
  >([]);
  const [currentPrintIndex, setCurrentPrintIndex] = useState(0);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(
    null
  );
  
  // State for RTS sales order modal
  const [showSalesOrderModal, setShowSalesOrderModal] = useState(false);
  const [salesOrderId, setSalesOrderId] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast} = useToast();
  const [, setLocation] = useLocation();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get ALL P1 PO orders with full item status (for comprehensive view)
  // Fetch immediately to populate the tab count badge
  const { data: poOrders = [] } = useQuery({
    queryKey: ['/api/po-orders/all-p1-with-status'],
  });

  // Get features for order customization display
  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  });
  
  // Mutation for processing shipment
  const processShipmentMutation = useMutation({
    mutationFn: async ({ orderIds, weightPerItemLbs }: { orderIds: string[]; weightPerItemLbs: number }) => {
      return await apiRequest('/api/po-orders/process-shipment', {
        method: 'POST',
        body: JSON.stringify({ orderIds, weightPerItemLbs }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data) => {
      console.log('Shipment processed successfully:', data);
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/shipping-qc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/all-p1-with-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      
      // Store result and show success state
      setShipmentResult(data);
      setShipmentProcessing(false);
      
      toast({
        title: 'Shipment Processed Successfully',
        description: `Tracking: ${data.trackingNumber}. ${data.packingSlips.length} packing slip(s) generated.`,
      });
    },
    onError: (error: any) => {
      console.error('Shipment processing failed:', error);
      setShipmentProcessing(false);
      toast({
        title: 'Shipment Failed',
        description: error.message || 'Failed to process shipment',
        variant: 'destructive',
      });
    },
  });

  // Fetch all kickbacks to determine which orders have kickbacks
  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Helper function to download shipment documents
  const handleShipmentDocuments = (shipmentData: any) => {
    try {
      // Download shipping label (GIF base64)
      if (shipmentData.shippingLabel?.data) {
        const labelBlob = new Blob(
          [Uint8Array.from(atob(shipmentData.shippingLabel.data), c => c.charCodeAt(0))],
          { type: 'image/gif' }
        );
        const labelUrl = URL.createObjectURL(labelBlob);
        const labelLink = document.createElement('a');
        labelLink.href = labelUrl;
        labelLink.download = `Shipping-Label-${shipmentData.trackingNumber}.gif`;
        labelLink.click();
        URL.revokeObjectURL(labelUrl);
      }

      // Download packing slips (PDF base64)
      if (shipmentData.packingSlips && Array.isArray(shipmentData.packingSlips)) {
        shipmentData.packingSlips.forEach((slip: any) => {
          const slipBlob = new Blob(
            [Uint8Array.from(atob(slip.data), c => c.charCodeAt(0))],
            { type: 'application/pdf' }
          );
          const slipUrl = URL.createObjectURL(slipBlob);
          const slipLink = document.createElement('a');
          slipLink.href = slipUrl;
          slipLink.download = slip.filename;
          slipLink.click();
          URL.revokeObjectURL(slipUrl);
        });
      }
    } catch (error) {
      console.error('Error downloading shipment documents:', error);
      toast({
        title: 'Download Error',
        description: 'Some documents may not have downloaded correctly',
        variant: 'destructive',
      });
    }
  };

  // Helper function to check if an order has kickbacks
  const hasKickbacks = (orderId: string) => {
    return (allKickbacks as any[]).some(
      (kickback: any) => kickback.orderId === orderId
    );
  };

  // Helper function to get the most severe kickback status for an order
  const getKickbackStatus = (orderId: string) => {
    const orderKickbacks = (allKickbacks as any[]).filter(
      (kickback: any) => kickback.orderId === orderId
    );
    if (orderKickbacks.length === 0) return null;

    // Priority order: CRITICAL > HIGH > MEDIUM > LOW
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const highestPriority = orderKickbacks.reduce(
      (highest: string, kickback: any) => {
        const currentIndex = priorities.indexOf(kickback.priority);
        const highestIndex = priorities.indexOf(highest);
        return currentIndex < highestIndex ? kickback.priority : highest;
      },
      'LOW'
    );

    return highestPriority;
  };

  // Function to handle kickback badge click
  const handleKickbackClick = (orderId: string) => {
    setLocation('/kickback-tracking');
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    const orderExists = qcShippingOrders.some(
      (order: any) => order.orderId === orderId
    );
    if (orderExists) {
      setSelectedOrders((prev) => new Set([...Array.from(prev), orderId]));
      setHighlightedOrderId(orderId);
      setTimeout(() => {
        const element = document.getElementById(`order-${orderId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      toast({
        title: 'Order selected',
        description: `Order ${orderId} selected automatically`,
      });
    } else {
      toast({
        title: 'Order not found',
        description: `Order ${orderId} is not in the Shipping QC department`,
        variant: 'destructive',
      });
    }
  };

  // Handle order search selection
  const handleOrderSearchSelect = (order: any) => {
    const orderExists = qcShippingOrders.some(
      (o: any) => o.orderId === order.orderId
    );
    if (orderExists) {
      setHighlightedOrderId(order.orderId);
      // Auto-scroll to the highlighted order
      setTimeout(() => {
        const element = document.getElementById(`order-${order.orderId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      toast({
        title: 'Success',
        description: `Order ${order.orderId} highlighted in the list`,
      });
    } else {
      toast({
        title: 'Error',
        description: `Order ${order.orderId} is not in the Shipping QC department`,
        variant: 'destructive',
      });
    }
  };

  // Get orders in QC/Shipping department and categorize by due date
  const qcShippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter(
      (order: any) =>
        order.currentDepartment === 'Shipping QC' ||
        order.currentDepartment === 'QC' ||
        (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
        (order.department === 'Shipping QC' && order.status === 'IN_PROGRESS')
    );

    // Separate orders with stock models from orders without stock models
    const regularOrders = filteredOrders.filter(
      (order: any) =>
        order.modelId &&
        order.modelId.trim() !== '' &&
        order.modelId.toLowerCase() !== 'none'
    );

    // Sort orders by due date
    return regularOrders.sort((a: any, b: any) => {
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allOrders]);

  // Get orders with no stock model - these are special handling orders
  const noStockModelOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter(
      (order: any) =>
        (order.currentDepartment === 'Shipping QC' ||
          order.currentDepartment === 'QC' ||
          (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
          (order.department === 'Shipping QC' &&
            order.status === 'IN_PROGRESS')) &&
        (!order.modelId ||
          order.modelId.trim() === '' ||
          order.modelId.toLowerCase() === 'none')
    );

    // Sort by due date
    return filteredOrders.sort((a: any, b: any) => {
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allOrders]);

  // Categorize orders by due date
  const categorizedOrders = useMemo(() => {
    const today = new Date();
    const categories = {
      overdue: [] as any[],
      dueToday: [] as any[],
      dueTomorrow: [] as any[],
      dueThisWeek: [] as any[],
      dueNextWeek: [] as any[],
      dueLater: [] as any[],
    };

    qcShippingOrders.forEach((order) => {
      const dueDate = new Date(order.dueDate);
      const daysDiff = differenceInDays(dueDate, today);

      if (daysDiff < 0) {
        categories.overdue.push(order);
      } else if (daysDiff === 0) {
        categories.dueToday.push(order);
      } else if (daysDiff === 1) {
        categories.dueTomorrow.push(order);
      } else if (daysDiff <= 7) {
        categories.dueThisWeek.push(order);
      } else if (daysDiff <= 14) {
        categories.dueNextWeek.push(order);
      } else {
        categories.dueLater.push(order);
      }
    });

    return categories;
  }, [qcShippingOrders]);

  // Count orders in previous department (Paint)
  const paintCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter(
      (order: any) =>
        order.currentDepartment === 'Paint' ||
        (order.department === 'Paint' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count completed orders (shipped)
  const completedCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter(
      (order: any) => order.status === 'COMPLETED' || order.status === 'SHIPPED'
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const models = stockModels as any[];
    const model = models.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Helper function to get department badge styling
  const getDepartmentBadge = (department: string | null) => {
    if (!department) {
      return { label: 'Not Scheduled', variant: 'outline' as const, className: 'border-gray-300 text-gray-600' };
    }
    
    const badgeMap: Record<string, { label: string; variant: any; className: string }> = {
      'Barcode': { label: 'Barcode', variant: 'default', className: 'bg-blue-100 text-blue-800 border-blue-300' },
      'CNC': { label: 'CNC', variant: 'default', className: 'bg-purple-100 text-purple-800 border-purple-300' },
      'Finish': { label: 'Finish', variant: 'default', className: 'bg-orange-100 text-orange-800 border-orange-300' },
      'Paint': { label: 'Paint', variant: 'default', className: 'bg-pink-100 text-pink-800 border-pink-300' },
      'Gunsmith': { label: 'Gunsmith', variant: 'default', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      'Shipping QC': { label: 'Shipping QC', variant: 'default', className: 'bg-green-100 text-green-800 border-green-300' },
      'Shipping': { label: 'Shipped', variant: 'default', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    };

    return badgeMap[department] || { label: department, variant: 'secondary' as const, className: '' };
  };

  // Helper function to get feature display name
  const getFeatureDisplayName = (featureId: string, optionValue: string) => {
    const featureList = features as any[];
    const feature = featureList.find((f: any) => f.id === featureId);
    if (!feature) return optionValue;

    const option = feature.options?.find(
      (opt: any) => opt.value === optionValue
    );
    return option?.label || optionValue;
  };

  // Helper function to check for specific bottom metals
  const hasSpecificBottomMetal = (order: any) => {
    const bottomMetal = order.features?.bottom_metal;
    const specificBottomMetals = [
      'AG-M5-SA',
      'AG-M5-LA',
      'AG-M5-LA-CIP',
      'AG-BDL-SA',
      'AG-BDL-LA',
    ];
    return bottomMetal && specificBottomMetals.includes(bottomMetal);
  };

  // Helper function to check for paid other options (shirt, hat, touch-up paint)
  const getPaidOtherOptions = (order: any) => {
    const paidOptions: string[] = [];

    // ONLY check the other_options array - this is where these items should be explicitly listed
    if (
      order.features?.other_options &&
      Array.isArray(order.features.other_options)
    ) {
      order.features.other_options.forEach((option: string) => {
        const optionLower = option.toLowerCase();

        // Very specific matching to avoid false positives
        if (
          optionLower === 'shirt' ||
          optionLower.includes('t-shirt') ||
          optionLower.includes('tshirt')
        ) {
          paidOptions.push('Shirt');
        }
        if (
          optionLower === 'hat' ||
          optionLower.includes('cap') ||
          optionLower.includes('beanie')
        ) {
          paidOptions.push('Hat');
        }
        // Only match explicit touch-up paint, not just any paint mention
        if (
          (optionLower.includes('touch-up') ||
            optionLower.includes('touchup')) &&
          optionLower.includes('paint')
        ) {
          paidOptions.push('Touch-up Paint');
        }
      });
    }

    return paidOptions;
  };

  // Helper function to format order features for tooltip
  const formatOrderFeatures = (order: any) => {
    if (!order.features) return 'No customizations';

    const featureEntries = Object.entries(order.features);
    if (featureEntries.length === 0) return 'No customizations';

    return featureEntries
      .map(([key, value]) => {
        const displayKey = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        if (Array.isArray(value)) {
          const displayValues = value
            .map((v) => getFeatureDisplayName(key, v))
            .join(', ');
          return `• ${displayKey}: ${displayValues}`;
        } else {
          const displayValue = getFeatureDisplayName(key, value as string);
          return `• ${displayKey}: ${displayValue}`;
        }
      })
      .join('\n');
  };

  // Handle checkbox selection
  const handleOrderSelection = (orderId: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (checked) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
    }
    setSelectedOrders(newSelected);
  };

  // Handle select all/none
  const handleSelectAll = () => {
    if (selectedOrders.size === qcShippingOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(
        new Set(qcShippingOrders.map((order) => order.orderId))
      );
    }
  };

  // Mutation for progressing orders to shipping
  const progressOrderMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const results = [];
      for (const orderId of orderIds) {
        const result = await apiRequest(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentDepartment: 'Shipping',
            department: 'Shipping',
            status: 'IN_PROGRESS',
          }),
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: (_, orderIds) => {
      toast({
        title: 'Orders Progressed',
        description: `${orderIds.length} orders moved to Shipping department`,
      });
      // Clear selection and invalidate cache
      setSelectedOrders(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
    },
    onError: (error: any) => {
      console.error('Error progressing orders to shipping:', error);
      toast({
        title: 'Error',
        description: 'Failed to progress orders to shipping',
        variant: 'destructive',
      });
    },
  });

  // Progress selected orders to shipping
  const progressToShipping = () => {
    if (selectedOrders.size === 0) return;
    const orderIds = Array.from(selectedOrders);
    progressOrderMutation.mutate(orderIds);
  };

  // Mutation for generating PO packing slips
  const generatePOPackingSlipsMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/po-orders/packing-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.pdfs && Array.isArray(data.pdfs)) {
        // Always an array - download each PDF
        data.pdfs.forEach((pdf: any, index: number) => {
          // Create blob from base64
          const byteCharacters = atob(pdf.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = pdf.filename;
          
          // Trigger download with small delay between files
          setTimeout(() => {
            link.click();
            URL.revokeObjectURL(url);
          }, index * 100);
        });
        
        toast({
          title: 'Packing Slips Generated',
          description: `Generated ${data.pdfs.length} packing slip(s)`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Invalid response format from server',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      console.error('Error generating packing slips:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate packing slips',
        variant: 'destructive',
      });
    },
  });

  // Mutation for progressing PO items to shipping
  const progressPOToShippingMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/po-orders/progress-to-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      return response;
    },
    onSuccess: (data) => {
      const { success, failed, message } = data;
      
      if (failed && failed.length > 0) {
        // Show detailed error messages
        const errorDetails = failed.map((f: any) => `${f.orderId}: ${f.reason}`).join('\n');
        console.warn('Failed items:', errorDetails);
        
        toast({
          title: success.length > 0 ? 'Partial Success' : 'Validation Failed',
          description: success.length > 0
            ? `${success.length} items progressed. ${failed.length} items failed - check console for details.`
            : `${failed.length} item(s) failed validation. Cannot progress. Check: ${failed[0].reason}`,
          variant: success.length > 0 ? 'default' : 'destructive',
        });
      } else {
        toast({
          title: 'Orders Progressed',
          description: message || `${success.length} items moved to Shipping`,
        });
      }
      
      // Clear selection and invalidate cache only if all succeeded
      if (!failed || failed.length === 0) {
        setSelectedPOItems(new Set());
        setSelectedCustomer(null);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/shipping-qc'] });
    },
    onError: (error: any) => {
      console.error('Error progressing PO orders:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to progress PO orders to shipping',
        variant: 'destructive',
      });
    },
  });

  // Handle PO packing slip generation
  const handlePOPackingSlips = () => {
    if (selectedPOItems.size === 0) return;
    const orderIds = Array.from(selectedPOItems);
    generatePOPackingSlipsMutation.mutate(orderIds);
  };

  // Handle PO progression to shipping
  const handlePOProgressToShipping = () => {
    if (selectedPOItems.size === 0) return;
    const orderIds = Array.from(selectedPOItems);
    progressPOToShippingMutation.mutate(orderIds);
  };

  // Handle QC checklist download
  const handleQCChecklistDownload = (orderId: string) => {
    try {
      window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');
      toast({
        title: 'QC checklist opened',
        description: `QC checklist for order ${orderId} opened in new tab for inspection`,
      });
    } catch (error) {
      console.error('Error generating QC checklist:', error);
      toast({
        title: 'Error generating QC checklist',
        description: 'Failed to generate QC checklist PDF',
        variant: 'destructive',
      });
    }
  };

  // Handle bulk QC checklist download for selected orders
  const handleBulkQCChecklistDownload = () => {
    if (selectedOrders.size === 0) return;

    const orderIds = Array.from(selectedOrders);
    let successCount = 0;
    let errorCount = 0;

    orderIds.forEach((orderId, index) => {
      try {
        // Add small delay between opening tabs to prevent browser blocking
        setTimeout(() => {
          window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');
          successCount++;
        }, index * 100);
      } catch (error) {
        console.error(`Error generating QC checklist for ${orderId}:`, error);
        errorCount++;
      }
    });

    // Show toast notification after processing
    setTimeout(
      () => {
        if (errorCount === 0) {
          toast({
            title: 'QC checklists opened',
            description: `${successCount} QC checklists opened in new tabs for printing`,
          });
        } else {
          toast({
            title: 'Partial success',
            description: `${successCount} checklists opened, ${errorCount} failed`,
            variant: 'destructive',
          });
        }
      },
      orderIds.length * 100 + 500
    );
  };

  // Handle sales order PDF download
  const handleSalesOrderView = (orderId: string) => {
    window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');
  };

  // Handle bulk sales order download
  const handleBulkSalesOrderDownload = () => {
    if (selectedOrders.size === 0) return;

    const orderIds = Array.from(selectedOrders);
    const queue = orderIds.map((orderId) => ({
      orderId,
      type: 'sales' as const,
    }));

    setPrintQueue(queue);
    setCurrentPrintIndex(0);
    setShowBulkPrintModal(true);
  };

  // Handle bulk QC checklist download with modal
  const handleBulkQCChecklistDownloadModal = () => {
    if (selectedOrders.size === 0) return;

    const orderIds = Array.from(selectedOrders);
    const queue = orderIds.map((orderId) => ({ orderId, type: 'qc' as const }));

    setPrintQueue(queue);
    setCurrentPrintIndex(0);
    setShowBulkPrintModal(true);
  };

  // Open current PDF in queue
  const openCurrentPDF = () => {
    if (currentPrintIndex >= printQueue.length) return;

    const current = printQueue[currentPrintIndex];
    const url =
      current.type === 'sales'
        ? `/api/shipping-pdf/sales-order/${current.orderId}`
        : `/api/shipping-pdf/qc-checklist/${current.orderId}`;

    window.open(url, '_blank');
  };

  // Move to next PDF in queue
  const nextPDF = () => {
    if (currentPrintIndex < printQueue.length - 1) {
      setCurrentPrintIndex(currentPrintIndex + 1);
    }
  };

  // Move to previous PDF in queue
  const previousPDF = () => {
    if (currentPrintIndex > 0) {
      setCurrentPrintIndex(currentPrintIndex - 1);
    }
  };

  // Close bulk print modal
  const closeBulkPrintModal = () => {
    setShowBulkPrintModal(false);
    setPrintQueue([]);
    setCurrentPrintIndex(0);
  };

  // UPS Label functionality moved from ShippingManagement.tsx
  const handleCreateLabel = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowLabelCreator(true);
  };

  const handleLabelSuccess = (data: any) => {
    setLabelData(data);
    setShowLabelViewer(true);
    queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    toast({
      title: 'Shipping label created',
      description: 'Label has been generated successfully',
    });
  };

  const downloadLabel = (
    labelBase64: string,
    trackingNumber: string,
    orderId: string
  ) => {
    const link = document.createElement('a');
    link.href = `data:image/gif;base64,${labelBase64}`;
    link.download = `UPS_Label_${orderId}_${trackingNumber}.gif`;
    link.click();
  };

  // Mark order as shipped mutation
  const markShippedMutation = useMutation({
    mutationFn: ({
      orderId,
      trackingData,
    }: {
      orderId: string;
      trackingData: any;
    }) =>
      apiRequest(`/api/shipping/mark-shipped/${orderId}`, {
        method: 'POST',
        body: trackingData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast({
        title: 'Order Shipped',
        description: 'Order has been marked as shipped and customer notified',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark order as shipped',
        variant: 'destructive',
      });
    },
  });

  const handleMarkShipped = (order: any) => {
    if (!order.trackingNumber) {
      toast({
        title: 'No Tracking Number',
        description: 'Please create a shipping label first',
        variant: 'destructive',
      });
      return;
    }

    markShippedMutation.mutate({
      orderId: order.orderId,
      trackingData: {
        trackingNumber: order.trackingNumber,
        shippingCarrier: order.shippingCarrier || 'UPS',
        shippingMethod: 'Ground',
        sendNotification: true,
        notificationMethod: 'email',
      },
    });
  };

  // Handle RTS sales order view
  const handleRTSSalesOrderView = (orderId: string) => {
    setSalesOrderId(orderId);
    setShowSalesOrderModal(true);
  };

  // Handle RTS shipping label print
  const handleRTSLabelPrint = (order: any) => {
    if (!order.trackingNumber || !order.shippingLabelUrl) {
      toast({
        title: 'No Shipping Label',
        description: 'This RTS order does not have a shipping label yet',
        variant: 'destructive',
      });
      return;
    }

    // Open the label in a new window for printing
    const labelWindow = window.open('', '_blank');
    if (labelWindow) {
      labelWindow.document.write(`
        <html>
          <head>
            <title>Shipping Label - ${order.orderId}</title>
          </head>
          <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
            <img src="${order.shippingLabelUrl}" alt="Shipping Label" style="max-width: 100%; height: auto;" />
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      labelWindow.document.close();
    }

    toast({
      title: 'Label Opened',
      description: `Shipping label for ${order.orderId} opened for printing`,
    });
  };

  // Order card component with updated buttons - Sales Order + Shipping Label
  const OrderCard = ({
    order,
    borderColor,
    dueDateColor,
  }: {
    order: any;
    borderColor: string;
    dueDateColor: string;
  }) => (
    <Card
      key={order.orderId}
      id={`order-${order.orderId}`}
      className={`border-l-4 ${borderColor} ${
        highlightedOrderId === order.orderId
          ? 'ring-4 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-l-yellow-500 shadow-lg'
          : selectedOrders.has(order.orderId)
            ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span>{order.orderId}</span>
              {order.isRtsOrder && (
                <Badge className="bg-orange-500 text-white flex items-center gap-1 px-2 py-0.5 font-bold text-xs">
                  <Package className="w-3 h-3" />
                  RTS
                </Badge>
              )}
              {(order.urgency === 'high' || order.urgency === 'critical') && order.isManualUrgency && (
                <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-0.5 font-bold text-xs">
                  <Zap className="w-3 h-3" />
                  URGENT!!!
                </Badge>
              )}
            </div>
            {order.fbOrderNumber && (
              <span className="text-xs text-gray-600 font-normal">
                FB: {order.fbOrderNumber}
              </span>
            )}
          </div>
          <Checkbox
            checked={selectedOrders.has(order.orderId)}
            onCheckedChange={(checked) =>
              handleOrderSelection(order.orderId, checked as boolean)
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-sm font-medium truncate">
          {order.customer || 'Unknown Customer'}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
          {getModelDisplayName(order.stockModelId || order.modelId)}
        </p>
        {order.dueDate && (
          <p className={`text-xs font-medium ${dueDateColor}`}>
            Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
          </p>
        )}

        {/* QC Checkboxes for specific items */}
        <div className="space-y-1 mt-2 mb-2">
          {/* Bottom Metal Checkbox */}
          {hasSpecificBottomMetal(order) && (
            <div className="flex items-center space-x-2">
              <Checkbox id={`bottom-metal-${order.orderId}`} />
              <label
                htmlFor={`bottom-metal-${order.orderId}`}
                className="text-xs font-medium text-blue-700 dark:text-blue-300"
              >
                Bottom Metal ({order.features.bottom_metal})
              </label>
            </div>
          )}

          {/* Paid Other Options Checkboxes */}
          {getPaidOtherOptions(order).map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <Checkbox id={`paid-option-${order.orderId}-${index}`} />
              <label
                htmlFor={`paid-option-${order.orderId}-${index}`}
                className="text-xs font-medium text-green-700 dark:text-green-300"
              >
                {option}
              </label>
            </div>
          ))}
        </div>

        {/* Show Kickback Badge if order has kickbacks */}
        {hasKickbacks(order.orderId) && (
          <div className="mb-2">
            <Badge
              variant="destructive"
              className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
                getKickbackStatus(order.orderId) === 'CRITICAL'
                  ? 'bg-red-600 hover:bg-red-700'
                  : getKickbackStatus(order.orderId) === 'HIGH'
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : getKickbackStatus(order.orderId) === 'MEDIUM'
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-gray-600 hover:bg-gray-700'
              }`}
              onClick={() => handleKickbackClick(order.orderId)}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Kickback
            </Badge>
          </div>
        )}

        {/* RTS Order specific buttons */}
        {order.isRtsOrder ? (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRTSSalesOrderView(order.orderId)}
              className="flex-1 text-xs"
              data-testid={`button-rts-sales-order-${order.orderId}`}
            >
              <FileText className="h-3 w-3 mr-1" />
              Sales Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRTSLabelPrint(order)}
              className="flex-1 text-xs"
              data-testid={`button-rts-label-${order.orderId}`}
            >
              <Printer className="h-3 w-3 mr-1" />
              Label
            </Button>
          </div>
        ) : (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQCChecklistDownload(order.orderId)}
              className="flex-1 text-xs"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              QC Checklist
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSalesOrderView(order.orderId)}
              className="flex-1 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Sales Order
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping QC Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Order Search Box */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <OrderSearchBox
              orders={qcShippingOrders}
              placeholder="Search orders by Order ID or FishBowl Number..."
              onOrderSelect={handleOrderSearchSelect}
            />
            {highlightedOrderId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHighlightedOrderId(null)}
                className="text-sm"
              >
                Clear highlight
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Paint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {paintCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders awaiting QC review
            </p>
          </CardContent>
        </Card>

        {/* Completed Orders Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {completedCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders shipped/completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Regular Orders and PO Orders */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="regular" data-testid="tab-regular-orders">
            Regular Orders ({qcShippingOrders.length + noStockModelOrders.length})
          </TabsTrigger>
          <TabsTrigger value="po" data-testid="tab-po-orders">
            PO Orders ({(poOrders as any[]).reduce((total, customer) => total + customer.pos.reduce((sum: number, po: any) => sum + po.items.length, 0), 0)})
          </TabsTrigger>
        </TabsList>

        {/* Regular Orders Tab */}
        <TabsContent value="regular" className="space-y-6">
          {/* Current Department Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Shipping QC Department Manager</span>
                <div className="flex items-center gap-2">
                  {qcShippingOrders.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      className="text-xs"
                    >
                      {selectedOrders.size === qcShippingOrders.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  )}
                  <Badge variant="outline" className="ml-2">
                    {qcShippingOrders.length} Orders
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
        <CardContent>
          {qcShippingOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in Shipping QC queue
            </div>
          ) : (
            <div className="space-y-8">
              {/* Overdue Orders */}
              {categorizedOrders.overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-red-600" />
                    <h3 className="text-lg font-semibold text-red-600">
                      Overdue ({categorizedOrders.overdue.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.overdue.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-red-500"
                        dueDateColor="text-red-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Due Today */}
              {categorizedOrders.dueToday.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-orange-600">
                      Due Today ({categorizedOrders.dueToday.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueToday.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-orange-500"
                        dueDateColor="text-orange-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Due Tomorrow */}
              {categorizedOrders.dueTomorrow.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-yellow-600">
                      Due Tomorrow ({categorizedOrders.dueTomorrow.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueTomorrow.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-yellow-500"
                        dueDateColor="text-yellow-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Due This Week */}
              {categorizedOrders.dueThisWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-600">
                      Due This Week ({categorizedOrders.dueThisWeek.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueThisWeek.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-blue-500"
                        dueDateColor="text-blue-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Due Next Week */}
              {categorizedOrders.dueNextWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-green-600">
                      Due Next Week ({categorizedOrders.dueNextWeek.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueNextWeek.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-green-500"
                        dueDateColor="text-green-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Due Later */}
              {categorizedOrders.dueLater.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-600">
                      Due Later ({categorizedOrders.dueLater.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueLater.map((order: any) => (
                      <OrderCard
                        key={order.orderId}
                        order={order}
                        borderColor="border-l-gray-500"
                        dueDateColor="text-gray-600"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* No Stock Model Orders - Special Handling Queue */}
      {noStockModelOrders.length > 0 && (
        <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-purple-600" />
                <span className="text-purple-700 dark:text-purple-300">
                  Special Handling Orders (No Stock Model)
                </span>
              </div>
              <Badge
                variant="outline"
                className="border-purple-300 text-purple-700 dark:text-purple-300"
              >
                {noStockModelOrders.length} Orders
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-purple-600 dark:text-purple-400">
                These orders have no stock model selected and require special
                handling before shipping.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {noStockModelOrders.map((order: any) => (
                <OrderCard
                  key={order.orderId}
                  order={order}
                  borderColor="border-l-purple-500"
                  dueDateColor="text-purple-600"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        {/* PO Orders Tab - Comprehensive Status Tracking */}
        <TabsContent value="po" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>P1 Purchase Orders - Pipeline Status</span>
                <div className="flex items-center gap-2">
                  {selectedPOItems.size > 0 && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowShipmentModal(true)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs"
                        data-testid="button-ship-selected"
                      >
                        <Truck className="h-4 w-4 mr-2" />
                        Ship Selected ({selectedPOItems.size})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPOItems(new Set());
                          setSelectedCustomer(null);
                        }}
                        className="text-xs"
                        data-testid="button-clear-selection"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear Selection
                      </Button>
                    </>
                  )}
                  <Badge variant="outline">
                    {(poOrders as any[]).reduce((total, customer) => {
                      return total + customer.pos.reduce((sum: number, po: any) => {
                        return sum + po.items.filter((item: any) => item.isReadyToShip).length;
                      }, 0);
                    }, 0)} Ready to Ship
                  </Badge>
                  <Badge variant="secondary">
                    {(poOrders as any[]).reduce((total, customer) => total + customer.pos.reduce((sum: number, po: any) => sum + po.items.length, 0), 0)} Total Items
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(poOrders as any[]).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No open P1 purchase orders
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    All P1 PO items tracked across departments. Only items in <strong>Shipping QC</strong> can be selected for shipping progression. <strong>You can select individual items from different POs of the same customer to ship together.</strong> Sorted by earliest due date.
                  </p>
                  
                  {/* Customer Groups */}
                  {(poOrders as any[]).map((customer: any) => {
                    const readyToShipCount = customer.pos.reduce((sum: number, po: any) => 
                      sum + po.items.filter((item: any) => item.isReadyToShip).length, 0
                    );
                    const totalCount = customer.pos.reduce((sum: number, po: any) => sum + po.items.length, 0);
                    
                    return (
                      <Collapsible key={customer.customerName} defaultOpen={readyToShipCount > 0}>
                        <Card className="border-2">
                          <CollapsibleTrigger className="w-full">
                            <CardHeader className="pb-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer">
                              <CardTitle className="text-lg flex items-center justify-between">
                                <span className="text-blue-700 dark:text-blue-300">
                                  {customer.customerName}
                                  {customer.earliestDueDate && (
                                    <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-3">
                                      Due: {new Date(customer.earliestDueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="default" className="bg-green-600">
                                    {readyToShipCount} Ready
                                  </Badge>
                                  <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                                    {totalCount} Total
                                  </Badge>
                                </div>
                              </CardTitle>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-4 space-y-4">
                              {/* PO Sections */}
                              {customer.pos.map((po: any) => {
                                const poReadyCount = po.items.filter((item: any) => item.isReadyToShip).length;
                                const completionPercentage = Math.round((po.completedUnits / po.totalUnits) * 100);
                                
                                return (
                                  <Collapsible key={po.poNumber} defaultOpen={poReadyCount > 0}>
                                    <div className="border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                      <CollapsibleTrigger className="w-full">
                                        <div className="p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-semibold text-gray-700 dark:text-gray-300">
                                              PO #{po.poNumber}
                                            </h4>
                                            <div className="flex items-center gap-2">
                                              <Badge variant="default" className="bg-green-600">
                                                {poReadyCount} Ready
                                              </Badge>
                                              <Badge variant="secondary">
                                                {po.totalUnits} Units
                                              </Badge>
                                            </div>
                                          </div>
                                          {/* Progress Bar */}
                                          <div className="space-y-1">
                                            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                                              <span>Production Progress</span>
                                              <span>{completionPercentage}% complete</span>
                                            </div>
                                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                              <div 
                                                className="bg-blue-600 h-2 rounded-full transition-all"
                                                style={{ width: `${completionPercentage}%` }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="px-4 pb-4 space-y-2">
                                          {po.items.map((item: any) => {
                                            const isSelected = selectedPOItems.has(item.orderId);
                                            const isDisabled = !item.isReadyToShip || !!(selectedCustomer && selectedCustomer !== customer.customerName);
                                            const departmentBadge = getDepartmentBadge(item.currentDepartment, item.productionStatus);
                                            
                                            return (
                                              <div
                                                key={item.orderId || `unscheduled-${item.poItemId}-${item.unitNumber}`}
                                                className={`
                                                  flex items-center gap-3 p-3 rounded border
                                                  ${isSelected ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-400' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}
                                                  ${!item.isReadyToShip ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'}
                                                  ${isDisabled && item.isReadyToShip ? 'opacity-50 cursor-not-allowed' : ''}
                                                `}
                                                data-testid={item.orderId ? `po-item-${item.orderId}` : `po-item-unscheduled-${item.poItemId}-${item.unitNumber}`}
                                              >
                                                {item.isReadyToShip && (
                                                  <Checkbox
                                                    checked={isSelected}
                                                    disabled={isDisabled}
                                                    onCheckedChange={(checked) => {
                                                      const newSelected = new Set(selectedPOItems);
                                                      if (checked) {
                                                        newSelected.add(item.orderId);
                                                        setSelectedCustomer(customer.customerName);
                                                      } else {
                                                        newSelected.delete(item.orderId);
                                                        if (newSelected.size === 0) {
                                                          setSelectedCustomer(null);
                                                        }
                                                      }
                                                      setSelectedPOItems(newSelected);
                                                    }}
                                                    data-testid={`checkbox-po-item-${item.orderId}`}
                                                  />
                                                )}
                                                {!item.isReadyToShip && <div className="w-6" />}
                                                
                                                <div className="flex-1 grid grid-cols-5 gap-2 text-sm items-center">
                                                  <div>
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                      {item.orderId || `Unit ${item.unitNumber}`}
                                                    </span>
                                                    <span className="text-gray-500 ml-2 text-xs">
                                                      {item.unitNumber}/{item.totalQuantity}
                                                    </span>
                                                  </div>
                                                  <div className="text-gray-600 dark:text-gray-400">
                                                    {item.description || 'No description'}
                                                  </div>
                                                  <div className="text-gray-600 dark:text-gray-400">
                                                    {item.stockModel || '—'}
                                                  </div>
                                                  <div className="text-gray-600 dark:text-gray-400">
                                                    {item.actionLength ? `${item.actionLength}"` : '—'} | {item.caliber || '—'}
                                                  </div>
                                                  <div className="flex items-center gap-2 justify-end flex-wrap">
                                                    <Badge variant={departmentBadge.variant} className={departmentBadge.className}>
                                                      {departmentBadge.label}
                                                    </Badge>
                                                    {item.flatTop && (
                                                      <Badge variant="outline" className="border-purple-300 text-purple-700 dark:text-purple-300 text-xs">
                                                        Flat Top
                                                      </Badge>
                                                    )}
                                                    {item.isFulfilled && (
                                                      <Badge variant="outline" className="border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs">
                                                        ✓ Fulfilled
                                                      </Badge>
                                                    )}
                                                    {item.orderId && (
                                                      <Button
                                                        size="sm"
                                                        variant={item.isFulfilled ? "outline" : "secondary"}
                                                        onClick={async () => {
                                                          try {
                                                            await apiRequest(`/api/po-orders/toggle-fulfilled`, {
                                                              method: 'POST',
                                                              body: JSON.stringify({
                                                                orderId: item.orderId,
                                                                isFulfilled: !item.isFulfilled,
                                                              }),
                                                            });
                                                            toast({
                                                              title: item.isFulfilled ? "Unmarked as fulfilled" : "Marked as fulfilled",
                                                              description: `${item.orderId} ${item.isFulfilled ? 'can now be shipped through the system' : 'has been marked as shipped externally'}`,
                                                            });
                                                            queryClient.invalidateQueries({ queryKey: ['/api/po-orders/all-p1-with-status'] });
                                                          } catch (error: any) {
                                                            toast({
                                                              title: "Error",
                                                              description: error.message || "Failed to update fulfilled status",
                                                              variant: "destructive",
                                                            });
                                                          }
                                                        }}
                                                        className="text-xs h-7"
                                                        data-testid={`toggle-fulfilled-${item.orderId}`}
                                                      >
                                                        {item.isFulfilled ? "Unmark Fulfilled" : "Mark Fulfilled"}
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                );
                              })}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating Progression Button for PO Orders */}
      {selectedPOItems.size > 0 && activeTab === 'po' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedPOItems.size} PO item{selectedPOItems.size > 1 ? 's' : ''} selected
                  {selectedCustomer && ` from ${selectedCustomer}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPOItems(new Set());
                    setSelectedCustomer(null);
                  }}
                  size="sm"
                  data-testid="button-clear-po-selection"
                >
                  Clear Selection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-purple-900/20"
                  disabled={selectedPOItems.size === 0 || generatePOPackingSlipsMutation.isPending}
                  onClick={handlePOPackingSlips}
                  data-testid="button-generate-po-packing-slips"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {generatePOPackingSlipsMutation.isPending
                    ? 'Generating...'
                    : `Generate Packing Slips (${selectedPOItems.size})`}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={selectedPOItems.size === 0 || progressPOToShippingMutation.isPending}
                  onClick={handlePOProgressToShipping}
                  data-testid="button-progress-po-to-shipping"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressPOToShippingMutation.isPending
                    ? 'Progressing...'
                    : `Progress to Shipping (${selectedPOItems.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Progression Button for Regular Orders */}
      {selectedOrders.size > 0 && activeTab === 'regular' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedOrders.size} order
                  {selectedOrders.size > 1 ? 's' : ''} selected for shipping
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrders(new Set())}
                  size="sm"
                >
                  Clear Selection
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkSalesOrderDownload}
                  size="sm"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Print Sales Orders ({selectedOrders.size})
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkQCChecklistDownloadModal}
                  disabled={selectedOrders.size === 0}
                  size="sm"
                  className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/20"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Print QC Checklists ({selectedOrders.size})
                </Button>
                <Button
                  onClick={progressToShipping}
                  disabled={
                    selectedOrders.size === 0 || progressOrderMutation.isPending
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressOrderMutation.isPending
                    ? 'Progressing...'
                    : `Progress to Shipping (${selectedOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPS Label Creator Dialog */}
      {showLabelCreator && selectedOrderId && (
        <UPSLabelCreator
          orderId={selectedOrderId}
          isOpen={showLabelCreator}
          onClose={() => {
            setShowLabelCreator(false);
            setSelectedOrderId(null);
          }}
          onSuccess={handleLabelSuccess}
        />
      )}

      {/* Label Viewer Dialog */}
      {showLabelViewer && labelData && (
        <Dialog open={showLabelViewer} onOpenChange={setShowLabelViewer}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Shipping Label Generated</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-sm">
                  <strong>Tracking Number:</strong> {labelData.trackingNumber}
                </p>
                <p className="text-sm">
                  <strong>Service:</strong> {labelData.serviceDescription}
                </p>
                <p className="text-sm">
                  <strong>Cost:</strong> ${labelData.totalCharges}
                </p>
              </div>
              {labelData.labelImageFormat && (
                <div className="text-center">
                  <Button
                    onClick={() =>
                      downloadLabel(
                        labelData.graphicImage,
                        labelData.trackingNumber,
                        selectedOrderId!
                      )
                    }
                    className="mb-4"
                  >
                    Download Label
                  </Button>
                  <div className="border rounded-lg p-4 bg-white flex justify-center">
                    <img
                      src={`data:image/gif;base64,${labelData.graphicImage}`}
                      alt="Shipping Label"
                      style={{ width: '4in', height: '6in', objectFit: 'contain' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Print Queue Modal */}
      {showBulkPrintModal && (
        <Dialog open={showBulkPrintModal} onOpenChange={closeBulkPrintModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Bulk Print Queue
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-lg font-semibold mb-2">
                  {printQueue[currentPrintIndex]?.type === 'sales'
                    ? 'Sales Order'
                    : 'QC Checklist'}
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {printQueue[currentPrintIndex]?.orderId}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {currentPrintIndex + 1} of {printQueue.length}
                </div>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={previousPDF}
                  disabled={currentPrintIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                <Button
                  onClick={openCurrentPDF}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Open PDF
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextPDF}
                  disabled={currentPrintIndex === printQueue.length - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeBulkPrintModal}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-4 w-4 mr-1" />
                  Close Queue
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Sales Order Modal for RTS Orders */}
      {salesOrderId && (
        <SalesOrderModal
          isOpen={showSalesOrderModal}
          onClose={() => {
            setShowSalesOrderModal(false);
            setSalesOrderId(null);
          }}
          orderId={salesOrderId}
        />
      )}

      {/* Shipment Confirmation Modal */}
      {showShipmentModal && (
        <Dialog 
          open={showShipmentModal} 
          onOpenChange={(open) => {
            if (!shipmentProcessing) {
              setShowShipmentModal(open);
              if (!open) {
                setShipmentResult(null);
                setWeightPerItem(5);
                setSelectedPOItems(new Set());
                setSelectedCustomer(null);
              }
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {shipmentResult ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    Shipment Created Successfully
                  </>
                ) : (
                  <>
                    <Truck className="h-6 w-6 text-blue-600" />
                    Confirm Shipment
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            {shipmentResult ? (
              // SUCCESS STATE: Show tracking and download buttons
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">Tracking Number</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-mono bg-white dark:bg-gray-800 px-3 py-1 rounded border">
                      {shipmentResult.trackingNumber}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(shipmentResult.trackingNumber);
                        toast({ title: 'Copied to clipboard' });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold mb-2">Download Documents</h4>
                  <Button
                    className="w-full"
                    onClick={() => handleShipmentDocuments(shipmentResult)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download All ({1 + shipmentResult.packingSlips.length} files)
                  </Button>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    • 1 Shipping Label (GIF)<br />
                    • {shipmentResult.packingSlips.length} Packing Slip(s) (PDF)
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setShowShipmentModal(false);
                      setShipmentResult(null);
                      setWeightPerItem(5);
                      setSelectedPOItems(new Set());
                      setSelectedCustomer(null);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              // CONFIRMATION STATE: Show shipment summary
              <div className="space-y-4">
                {(() => {
                  // Calculate shipment summary
                  const selectedItems = Array.from(selectedPOItems);
                  const poGroups = new Map<string, any[]>();
                  
                  // Group selected items by PO
                  (poOrders as any[]).forEach(customer => {
                    customer.pos.forEach((po: any) => {
                      po.items.forEach((item: any) => {
                        if (selectedItems.includes(item.orderId)) {
                          if (!poGroups.has(po.poNumber)) {
                            poGroups.set(po.poNumber, []);
                          }
                          poGroups.get(po.poNumber)!.push(item);
                        }
                      });
                    });
                  });

                  const totalWeight = selectedItems.length * weightPerItem;

                  return (
                    <>
                      {/* Summary Card */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Shipment Summary</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Total Items:</span>
                            <span className="ml-2 font-semibold">{selectedItems.length}</span>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Purchase Orders:</span>
                            <span className="ml-2 font-semibold">{poGroups.size}</span>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Customer:</span>
                            <span className="ml-2 font-semibold">{selectedCustomer}</span>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Service:</span>
                            <span className="ml-2 font-semibold">UPS Ground</span>
                          </div>
                        </div>
                      </div>

                      {/* PO Breakdown */}
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Purchase Order Breakdown</h4>
                        <div className="space-y-2">
                          {Array.from(poGroups.entries()).map(([poNumber, items]) => (
                            <div key={poNumber} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                              <span className="font-mono text-sm">PO #{poNumber}</span>
                              <Badge variant="secondary">{items.length} items</Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Weight Configuration */}
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Shipping Weight</h4>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="text-sm text-gray-600 dark:text-gray-400">Weight per item (lbs)</label>
                            <input
                              type="number"
                              min="1"
                              max="150"
                              value={weightPerItem}
                              onChange={(e) => setWeightPerItem(Math.max(1, parseInt(e.target.value) || 5))}
                              className="w-full px-3 py-2 border rounded-md"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-sm text-gray-600 dark:text-gray-400">Total weight</label>
                            <div className="text-2xl font-bold text-blue-600">{totalWeight} lbs</div>
                          </div>
                        </div>
                        {weightPerItem === 5 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                            ⚠️ Using default 5 lbs per item. Adjust if needed for accurate shipping cost.
                          </p>
                        )}
                      </div>

                      {/* Documents Preview */}
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Documents to Generate</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span>1 UPS Shipping Label (combined)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span>{poGroups.size} Packing Slip(s) (one per PO)</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowShipmentModal(false)}
                          disabled={shipmentProcessing}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            setShipmentProcessing(true);
                            processShipmentMutation.mutate({
                              orderIds: Array.from(selectedPOItems),
                              weightPerItemLbs: weightPerItem,
                            });
                          }}
                          disabled={shipmentProcessing}
                        >
                          {shipmentProcessing ? (
                            <>
                              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Confirm & Ship
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

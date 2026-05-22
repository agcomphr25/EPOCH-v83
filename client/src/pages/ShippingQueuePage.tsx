import React, { useMemo, useState } from 'react';
import { Package, ArrowLeft, CheckCircle, Zap } from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';
import OrderActionButtons from '@/components/OrderActionButtons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAdminUser } from '@/config/userPermissions';
import { format } from 'date-fns';
import { useLocation } from 'wouter';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ShippingActions } from '@/components/ShippingActions';
import { BulkShippingActions } from '@/components/BulkShippingActions';
import UPSLabelCreator from '@/components/UPSLabelCreator';
import OrderCardErrorBoundary from '@/components/OrderCardErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { fetchPdf, downloadPdf } from '@/utils/pdfUtils';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { OrderSearchBox } from '@/components/OrderSearchBox';
import WeeklyShippingWidget from '@/components/WeeklyShippingWidget';
import { LinkedOrderIndicator } from '@/components/LinkedOrderIndicator';
import TicketBadge, { useOrderTicketCounts } from '@/components/TicketBadge';
import { LinkedOrdersManager } from '@/components/LinkedOrdersManager';
import KickbackReportModal from '@/components/KickbackReportModal';

export default function ShippingQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showLabelCreator, setShowLabelCreator] = useState(false);
  const [labelData, setLabelData] = useState<any>(null);
  const [showLabelViewer, setShowLabelViewer] = useState(false);
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(
    null
  );
  const [kickbackModalOpen, setKickbackModalOpen] = useState(false);
  const [selectedOrderForKickback, setSelectedOrderForKickback] = useState<{orderId: string, department: string} | null>(null);
  const [shippingDetails, setShippingDetails] = useState({
    weight: '10',
    length: '12',
    width: '12',
    height: '12',
    value: '500',
    billingOption: 'sender', // 'sender', 'receiver', 'third_party'
    receiverAccount: {
      accountNumber: '',
      zipCode: '',
    },
    address: {
      name: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
    },
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Get current user information
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });
  const isAdmin = isAdminUser(currentUser);

  // Fetch only Shipping-department orders with payment status.
  // Using ?department=Shipping bypasses the row-count cap applied to the
  // all-orders view, so every order in Shipping is returned regardless of
  // how many total orders exist in the database.
  // NOTE: queryKey includes 'Shipping' to keep this cache entry separate from
  // the generic ['/api/orders/with-payment-status'] entries used by other
  // pages. Cache invalidation uses prefix matching so invalidating
  // ['/api/orders/with-payment-status'] still clears this entry.
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/with-payment-status', 'Shipping'],
    queryFn: () => apiRequest('/api/orders/with-payment-status?department=Shipping'),
    staleTime: 0,
  });

  // Fetch Shipping QC orders separately to count the previous-department widget.
  // allOrders above is filtered to 'Shipping' only, so we need a dedicated query
  // for the 'Shipping QC' count shown on the dashboard widget.
  const { data: shippingQCOrders = [] } = useQuery({
    queryKey: ['/api/orders/with-payment-status', 'Shipping QC'],
    queryFn: () => apiRequest('/api/orders/with-payment-status?department=Shipping%20QC'),
    staleTime: 0,
  });

  // Fetch all kickbacks to determine which orders have kickbacks
  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });


  // Fetch RTS inventory items in shipping department
  const { data: rtsItemsInShipping = [] } = useQuery({
    queryKey: ['/api/rts-inventory/in-shipping'],
  });

  // Fetch RMAs ready for shipping (resolved Repair/Rework NCRs)
  const { data: rmasReadyToShip = [] } = useQuery({
    queryKey: ['/api/nonconformance/ready-to-ship'],
  });

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
    const orderExists = shippingOrders.some(
      (order: any) => order.orderId === orderId
    );
    if (orderExists) {
      setSelectedOrders((prev) => [...prev, orderId]);
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
        description: `Order ${orderId} is not in the Shipping department`,
        variant: 'destructive',
      });
    }
  };

  // Handle order search selection
  const handleOrderSearchSelect = (order: any) => {
    const orderExists = shippingOrders.some(
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
        description: `Order ${order.orderId} is not in the Shipping department`,
        variant: 'destructive',
      });
    }
  };

  // Helper to check if an orderId belongs to an RMA
  const isRmaOrder = (orderId: string) => {
    return orderId.startsWith('RMA') || orderId.startsWith('rma');
  };

  // Mutation to fulfill orders and move to shipping management
  const fulfillOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (isRmaOrder(orderId)) {
        const rmaOrder = shippingOrders.find((o: any) => o.orderId === orderId);
        return await apiRequest('/api/nonconformance/fulfill', {
          method: 'POST',
          body: {
            orderId,
            trackingNumber: rmaOrder?.trackingNumber || undefined,
            shippingCarrier: rmaOrder?.shippingCarrier || undefined,
            shippedDate: rmaOrder?.shippedDate || undefined,
          },
        });
      }
      return await apiRequest('/api/orders/fulfill', {
        method: 'POST',
        body: { orderId },
      });
    },
    onSuccess: async (_, orderId) => {
      const isRma = isRmaOrder(orderId);
      toast({
        title: isRma ? 'RMA Fulfilled' : 'Order Fulfilled',
        description: isRma
          ? `RMA ${orderId} has been marked as shipped and resolved on the nonconformance tracker`
          : `Order ${orderId} has been marked as fulfilled and moved to shipping management`,
      });
      
      setSelectedCard(null);
      setSelectedOrders([]);
      
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['/api/orders/with-payment-status'],
        }),
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/nonconformance/ready-to-ship'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/nonconformance'] }),
      ]);
      
      await queryClient.refetchQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error fulfilling order',
        description: error.message || 'Failed to fulfill order',
        variant: 'destructive',
      });
    },
  });

  // Bulk fulfill mutation for marking multiple orders as fulfilled at once
  const bulkFulfillMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const results = await Promise.all(
        orderIds.map(orderId => {
          if (isRmaOrder(orderId)) {
            const rmaOrder = shippingOrders.find((o: any) => o.orderId === orderId);
            return apiRequest('/api/nonconformance/fulfill', {
              method: 'POST',
              body: {
                orderId,
                trackingNumber: rmaOrder?.trackingNumber || undefined,
                shippingCarrier: rmaOrder?.shippingCarrier || undefined,
                shippedDate: rmaOrder?.shippedDate || undefined,
              },
            });
          }
          return apiRequest('/api/orders/fulfill', {
            method: 'POST',
            body: { orderId },
          });
        })
      );
      return results;
    },
    onSuccess: async (_, orderIds) => {
      const rmaCount = orderIds.filter(id => isRmaOrder(id)).length;
      const orderCount = orderIds.length - rmaCount;
      const parts = [];
      if (orderCount > 0) parts.push(`${orderCount} order${orderCount > 1 ? 's' : ''} fulfilled`);
      if (rmaCount > 0) parts.push(`${rmaCount} RMA${rmaCount > 1 ? 's' : ''} resolved`);
      
      toast({
        title: 'Items Fulfilled',
        description: parts.join(', '),
      });
      
      setSelectedCard(null);
      setSelectedOrders([]);
      
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['/api/orders/with-payment-status'],
        }),
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/nonconformance/ready-to-ship'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/nonconformance'] }),
      ]);
      
      await queryClient.refetchQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error fulfilling orders',
        description: error.message || 'Failed to fulfill some orders',
        variant: 'destructive',
      });
    },
  });

  // Helper to safely parse date values - returns null if invalid
  const safeParseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  };

  // Get orders in Shipping department, categorized by due date
  const shippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter(
      (order: any) =>
        order.currentDepartment === 'Shipping' ||
        (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );

    // Merge RMAs ready to ship into the shipping queue
    const rmas = rmasReadyToShip as any[];
    const allShippingItems = [...filteredOrders, ...rmas];

    // Sort by due date - most urgent first (RMAs without due date go to end)
    return allShippingItems.sort((a: any, b: any) => {
      const parsedA = safeParseDate(a.dueDate);
      const parsedB = safeParseDate(b.dueDate);
      const dateA = parsedA ? parsedA.getTime() : (a.isRma ? Date.now() : 0);
      const dateB = parsedB ? parsedB.getTime() : (b.isRma ? Date.now() : 0);
      return dateA - dateB; // Earliest due date first (most urgent)
    });
  }, [allOrders, rmasReadyToShip]);

  const orderIdsForTickets = useMemo(() => shippingOrders.map((o: any) => o.orderId), [shippingOrders]);
  const { data: ticketMap } = useOrderTicketCounts(orderIdsForTickets);

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
      const dueDate = safeParseDate(order.dueDate);
      
      // If no valid due date, put in dueLater
      if (!dueDate) {
        dueLater.push(order);
        return;
      }

      // Normalize to start of day for comparison
      const normalizedDueDate = new Date(dueDate);
      normalizedDueDate.setHours(0, 0, 0, 0);

      if (normalizedDueDate < today) {
        overdue.push(order);
      } else if (normalizedDueDate.getTime() === today.getTime()) {
        dueToday.push(order);
      } else if (normalizedDueDate.getTime() === tomorrow.getTime()) {
        dueTomorrow.push(order);
      } else if (normalizedDueDate <= nextWeek) {
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
      dueLater,
    };
  }, [shippingOrders]);

  // Count orders in previous department (Shipping QC).
  // Derived directly from the dedicated shippingQCOrders query — allOrders is
  // filtered to 'Shipping' only so we cannot reuse it here.
  const shippingQCCount = shippingQCOrders.length;

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Get customers data for address information
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Get unique customer IDs from shipping orders for address lookup (including alt ship-to customers)
  const uniqueCustomerIds = useMemo(() => {
    const orders = allOrders as any[];
    const shippingOrdersList = orders.filter(
      (order: any) =>
        order.currentDepartment === 'Shipping' ||
        (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );

    const customerIds = new Set<string>();

    shippingOrdersList.forEach((order) => {
      // Add main customer ID
      if (order.customerId) {
        customerIds.add(order.customerId);
      }
      // Add alt ship-to customer ID if it exists
      if (order.hasAltShipTo && order.altShipToCustomerId) {
        customerIds.add(order.altShipToCustomerId);
      }
    });

    return Array.from(customerIds);
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
            const response = await fetch(
              `/api/customers/${customerId}/addresses`
            );
            if (response.ok) {
              const addresses = await response.json();
              addressMap[customerId] = addresses;
            }
          } catch (error) {
            console.error(
              `Failed to fetch addresses for customer ${customerId}:`,
              error
            );
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

  const getCustomerInfo = (customerId: string | null | undefined) => {
    if (!customerId) return null;
    const customerList = customers as any[];
    return customerList.find(
      (c: any) => c.id?.toString() === customerId.toString()
    );
  };

  const getCustomerAddress = (customerId: string) => {
    const addressList = customerAddressesMap[customerId] || [];

    // Find default shipping address
    let address = addressList.find(
      (a: any) => a.type === 'shipping' && a.isDefault
    );

    // Fallback to any 'both' type default address
    if (!address) {
      address = addressList.find((a: any) => a.type === 'both' && a.isDefault);
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

  // NEW: Get shipping address for an order (checks alt ship-to first, then falls back to customer address)
  const getOrderShippingAddress = (order: any) => {
    // RMA orders already have their shipping address pre-computed by the backend
    if (order.isRma && order.shippingAddress) {
      return order.shippingAddress;
    }

    // Check if order has alternative ship-to address
    if (order.hasAltShipTo) {
      // Handle existing customer mode
      if (order.altShipToCustomerId) {
        const altCustomerAddress = getCustomerAddress(
          order.altShipToCustomerId
        );
        if (altCustomerAddress) {
          return altCustomerAddress;
        }
      }

      // Handle manual entry mode
      if (order.altShipToAddress) {
        // Convert the manual entry format to match the customer address format
        return {
          street: order.altShipToAddress.street || '',
          street2: order.altShipToAddress.street2 || null,
          city: order.altShipToAddress.city || '',
          state: order.altShipToAddress.state || '',
          zipCode: order.altShipToAddress.zipCode || '',
          country: order.altShipToAddress.country || 'United States',
          type: 'shipping',
          isDefault: true,
        };
      }
    }

    // Fallback to customer's default address
    return getCustomerAddress(order.customerId);
  };

  // Get customer info for alt ship-to addresses
  const getOrderShippingCustomerInfo = (order: any) => {
    // RMA orders have customer name directly from the nonconformance record
    if (order.isRma) {
      const addr = order.shippingAddress;
      return {
        name: addr?.name || order.customerName || 'RMA Customer',
        phone: '',
        email: '',
        company: '',
      };
    }

    // If order has alt ship-to with existing customer, get that customer's info
    if (order.hasAltShipTo && order.altShipToCustomerId) {
      return getCustomerInfo(order.altShipToCustomerId);
    }

    // If order has alt ship-to with manual entry, use the manual entry data
    if (order.hasAltShipTo && order.altShipToName) {
      return {
        name: order.altShipToName,
        phone: order.altShipToPhone || '',
        email: order.altShipToEmail || '',
        company: order.altShipToCompany || '',
      };
    }

    // Fallback to original customer info
    return getCustomerInfo(order.customerId);
  };

  // Enrich shipping orders with computed shipping addresses for bulk shipping
  const enrichedShippingOrders = useMemo(() => {
    // Don't enrich if customer addresses aren't loaded yet
    if (Object.keys(customerAddressesMap).length === 0 && uniqueCustomerIds.length > 0) {
      return shippingOrders;
    }
    
    return shippingOrders.map(order => ({
      ...order,
      shippingAddress: getOrderShippingAddress(order),
      shippingCustomerInfo: getOrderShippingCustomerInfo(order)
    }));
  }, [shippingOrders, customerAddressesMap]);

  const handleOrderSelection = (orderId: string, checked: boolean) => {
    console.log('🔘 Checkbox clicked:', orderId, 'checked:', checked);
    if (checked) {
      setSelectedOrders((prev) => {
        const newSelection = [...prev, orderId];
        console.log('✅ Selected orders updated:', newSelection);
        return newSelection;
      });
    } else {
      setSelectedOrders((prev) => {
        const newSelection = prev.filter((id) => id !== orderId);
        console.log('❌ Selected orders updated:', newSelection);
        return newSelection;
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(shippingOrders.map((order) => order.orderId));
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
    return shippingOrders.find((order) => order.orderId === selectedCard);
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
      targetOrder = shippingOrders.find((order) => order.orderId === orderId);
    } else {
      toast({
        title: 'No order selected',
        description:
          'Please select a single order by clicking on it or checking one checkbox',
        variant: 'destructive',
      });
      return;
    }

    if (!targetOrder) {
      toast({
        title: 'Order not found',
        description: 'Selected order not found in shipping queue',
        variant: 'destructive',
      });
      return;
    }

    try {
      toast({
        title: 'Generating QC checklist...',
        description: 'Please wait while we generate the PDF',
      });

      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');

      toast({
        title: 'QC checklist opened',
        description: `QC checklist for order ${orderId} opened in new tab for printing`,
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
      targetOrder = shippingOrders.find((order) => order.orderId === orderId);
    } else {
      toast({
        title: 'No order selected',
        description:
          'Please select a single order by clicking on it or checking one checkbox',
        variant: 'destructive',
      });
      return;
    }

    if (!targetOrder) {
      toast({
        title: 'Order not found',
        description: 'Selected order not found in shipping queue',
        variant: 'destructive',
      });
      return;
    }

    try {
      toast({
        title: 'Generating sales order invoice...',
        description: 'Please wait while we generate the PDF',
      });

      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');

      toast({
        title: 'Sales order invoice opened',
        description: `Sales order invoice for ${orderId} opened in new tab for printing`,
      });
    } catch (error) {
      console.error('Error generating sales order:', error);
      toast({
        title: 'Error generating sales order',
        description: 'Failed to generate sales order PDF',
        variant: 'destructive',
      });
    }
  };

  const handleShippingLabelCreator = async () => {
    console.log('🚢 Ship Label button clicked!');
    console.log('selectedCard:', selectedCard);
    console.log('selectedOrders:', selectedOrders);
    console.log('showShippingDialog before:', showShippingDialog);

    // Check for selected order - either from card selection or checkbox selection
    let targetOrder = null;
    let orderId = '';

    if (selectedCard) {
      // Use card selection if available
      targetOrder = getSelectedOrder();
      orderId = selectedCard;
      console.log('Using card selection:', orderId);
    } else if (selectedOrders.length === 1) {
      // Use single checkbox selection if only one order is selected
      orderId = selectedOrders[0];
      targetOrder = shippingOrders.find((order) => order.orderId === orderId);
      console.log('Using checkbox selection:', orderId);
    } else {
      console.log('No valid selection found');
      toast({
        title: 'No order selected',
        description:
          'Please select a single order by clicking on it or checking one checkbox',
        variant: 'destructive',
      });
      return;
    }

    if (!targetOrder) {
      console.log('Target order not found:', orderId);
      toast({
        title: 'Order not found',
        description: 'Selected order not found in shipping queue',
        variant: 'destructive',
      });
      return;
    }

    console.log('Target order found:', targetOrder.orderId);

    // Force dialog to open
    console.log('FORCING DIALOG TO OPEN NOW');
    setSelectedOrderId(orderId);
    setShowShippingDialog(true);

    // Debug check after state change
    setTimeout(() => {
      console.log('Dialog state after timeout:', showShippingDialog);
    }, 500);

    // Pre-populate shipping address from order-specific or customer data
    const customerInfo = getOrderShippingCustomerInfo(targetOrder);
    const customerAddress = getOrderShippingAddress(targetOrder);

    if (customerAddress && customerInfo) {
      setShippingDetails((prev) => ({
        ...prev,
        address: {
          name: customerInfo.name || '',
          street: customerAddress.street || '',
          city: customerAddress.city || '',
          state: customerAddress.state || '',
          zip: customerAddress.zipCode || '',
          country:
            customerAddress.country === 'United States'
              ? 'US'
              : customerAddress.country || 'US',
        },
      }));
    }
  };

  // Handle successful label creation
  const handleLabelSuccess = async (data: any) => {
    setLabelData(data);
    setShowLabelViewer(true);
    setShowLabelCreator(false);

    toast({
      title: 'Shipping Label Generated',
      description: `Label created with tracking number: ${data.trackingNumber}`,
    });

    if (selectedOrderId && isRmaOrder(selectedOrderId)) {
      try {
        const rmaOrder = shippingOrders.find((o: any) => o.orderId === selectedOrderId);
        const ncrId = rmaOrder?.rmaId;
        if (ncrId) {
          await apiRequest(`/api/nonconformance/${ncrId}/shipping`, {
            method: 'PATCH',
            body: {
              trackingNumber: data.trackingNumber,
              shippingCarrier: 'UPS',
              shippedDate: new Date().toISOString().split('T')[0],
              shippingStatus: 'Ready to Ship',
            },
          });
          queryClient.invalidateQueries({ queryKey: ['/api/nonconformance'] });
        }
      } catch (error) {
        console.error('Failed to save tracking info to RMA:', error);
      }
    }
  };

  // Generate shipping label with UPS API
  const generateShippingLabel = async () => {
    if (!selectedOrderId) return;

    try {
      const response = await fetch('/api/shipping/create-label', {
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
              height: parseFloat(shippingDetails.height),
            },
            declaredValue: parseFloat(shippingDetails.value),
          },
          billingOption: shippingDetails.billingOption,
          receiverAccount:
            shippingDetails.billingOption === 'receiver'
              ? shippingDetails.receiverAccount
              : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate shipping label');
      }

      const labelData = await response.json();
      setLabelData(labelData);
      setShowShippingDialog(false);
      setShowLabelViewer(true);

      toast({
        title: 'Shipping Label Generated',
        description: `Label created with tracking number: ${labelData.trackingNumber}`,
      });
    } catch (error) {
      console.error('Error generating label:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate shipping label. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Download label function
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Order Search Box */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <OrderSearchBox
              orders={shippingOrders}
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

      <ReturnsRepairsSection repairDepartment="Shipping" />

      {/* Floating Bulk Fulfill Actions */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4 space-y-4">
            {/* Progress to Fulfilled Section */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={clearSelection}
                    size="sm"
                    data-testid="button-clear-selection"
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={() => bulkFulfillMutation.mutate(selectedOrders)}
                    disabled={bulkFulfillMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-bulk-fulfill"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {bulkFulfillMutation.isPending
                      ? 'Progressing...'
                      : `Progress to Fulfilled (${selectedOrders.length})`}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Bulk Shipping Actions */}
            <BulkShippingActions
              selectedOrders={selectedOrders}
              onClearSelection={clearSelection}
              shippingOrders={enrichedShippingOrders}
            />
          </div>
        </div>
      )}

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

        {/* Weekly Shipping Tracker Widget */}
        <WeeklyShippingWidget />
      </div>

      {/* Orders List - Categorized by Due Date */}
      <div className="space-y-6">
        {/* Header Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>
                Shipping Queue ({shippingOrders.length} orders)
              </CardTitle>
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
                <div className="text-lg font-medium mb-2">
                  No orders in shipping queue
                </div>
                <div className="text-sm">
                  Orders will appear here when they're ready for shipping
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* RTS Inventory Items in Shipping */}
            {(rtsItemsInShipping as any[]).length > 0 && (
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-purple-700 text-sm font-medium flex items-center gap-2">
                    📦 RTS Inventory ({(rtsItemsInShipping as any[]).length})
                    <Badge variant="outline" className="ml-2 text-xs">
                      Finished Stock - Does not count towards weekly metrics
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {(rtsItemsInShipping as any[]).map((item: any) => (
                      <div
                        key={item.id}
                        className="p-4 bg-white rounded-lg border border-purple-100 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="font-semibold text-purple-900">
                              {item.stockModel}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                              {item.actionLength && (
                                <div>
                                  <span className="font-medium">Action Length:</span> {item.actionLength}
                                </div>
                              )}
                              {item.action && (
                                <div>
                                  <span className="font-medium">Action:</span> {item.action}
                                </div>
                              )}
                              {item.barrel && (
                                <div>
                                  <span className="font-medium">Barrel:</span> {item.barrel}
                                </div>
                              )}
                              {item.color && (
                                <div>
                                  <span className="font-medium">Color:</span> {item.color}
                                </div>
                              )}
                            </div>
                            {item.extras && (
                              <div className="text-xs text-gray-500">
                                Order Code: {item.extras}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 ml-4">
                            <Badge className="bg-purple-100 text-purple-800">
                              RTS Item
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await apiRequest(`/api/rts-inventory/${item.id}/mark-shipped`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({}),
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory/in-shipping'] });
                                  toast({
                                    title: 'Item Shipped',
                                    description: `${item.stockModel} has been marked as shipped`,
                                  });
                                } catch (error: any) {
                                  toast({
                                    title: 'Error',
                                    description: error.message || 'Failed to mark item as shipped',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                              className="w-full"
                            >
                              Mark as Shipped
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                    {categorizedOrders.overdue.map((order: any) => (
                      <OrderCardErrorBoundary key={`error-${order.orderId}`} orderId={order.orderId}>
                        {renderOrderCard(order)}
                      </OrderCardErrorBoundary>
                    ))}
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
                    {categorizedOrders.dueToday.map((order: any) => (
                      <OrderCardErrorBoundary key={`error-${order.orderId}`} orderId={order.orderId}>
                        {renderOrderCard(order)}
                      </OrderCardErrorBoundary>
                    ))}
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
                    {categorizedOrders.dueTomorrow.map((order: any) => (
                      <OrderCardErrorBoundary key={`error-${order.orderId}`} orderId={order.orderId}>
                        {renderOrderCard(order)}
                      </OrderCardErrorBoundary>
                    ))}
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
                    {categorizedOrders.dueThisWeek.map((order: any) => (
                      <OrderCardErrorBoundary key={`error-${order.orderId}`} orderId={order.orderId}>
                        {renderOrderCard(order)}
                      </OrderCardErrorBoundary>
                    ))}
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
                    {categorizedOrders.dueLater.map((order: any) => (
                      <OrderCardErrorBoundary key={`error-${order.orderId}`} orderId={order.orderId}>
                        {renderOrderCard(order)}
                      </OrderCardErrorBoundary>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Function to get specific special shipping text
  function getSpecialShippingText(order: any) {
    if (order.specialShippingInternational) return '🌍 International';
    if (order.specialShippingNextDayAir) return '⚡ Next Day Air';
    if (order.specialShippingBillToReceiver) return '💳 Bill to Receiver';
    if (order.hasAltShipTo) return '📍 Alt Ship To';
    return null;
  }

  function getShippingOptionsText(order: any) {
    const options = [
      order.shippingMethod && order.shippingMethod !== 'Ground'
        ? String(order.shippingMethod)
        : null,
      getSpecialShippingText(order),
    ].filter(Boolean);

    if (options.length === 0) return null;
    return options.join(' • ');
  }

  // Function to get other in-progress orders for the same customer
  function getCustomerOtherOrders(customerId: string | null, currentOrderId: string) {
    if (!customerId) return [];
    
    const orders = allOrders as any[];
    return orders.filter(
      (order: any) =>
        order.customerId === customerId &&
        order.orderId !== currentOrderId &&
        order.status === 'IN_PROGRESS' &&
        order.currentDepartment !== 'Shipping'
    );
  }

  // Helper function to safely parse features that may be a string or object
  function safeParseFeatures(features: any): Record<string, any> {
    if (!features) return {};
    if (typeof features === 'object') return features;
    if (typeof features === 'string') {
      try {
        return JSON.parse(features);
      } catch (e) {
        console.warn('Failed to parse features:', e);
        return {};
      }
    }
    return {};
  }

  // Helper function to safely format dates
  function safeFormatDate(dateValue: any, formatStr: string = 'MMM dd, yyyy'): string {
    if (!dateValue) return 'N/A';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'Invalid date';
      return format(date, formatStr);
    } catch (e) {
      console.warn('Failed to format date:', dateValue, e);
      return 'Invalid date';
    }
  }

  // Function to render individual order cards
  function renderOrderCard(order: any) {
    const isSelected = selectedCard === order.orderId;
    const modelId = order.stockModelId || order.modelId;
    const parsedFeatures = safeParseFeatures(order.features);
    const materialType = parsedFeatures?.material_type;
    const customerInfo = getOrderShippingCustomerInfo(order);
    const customerAddress = getOrderShippingAddress(order);
    const specialShippingText = getSpecialShippingText(order);
    const shippingOptionsText = getShippingOptionsText(order);
    const otherOrders = getCustomerOtherOrders(order.customerId, order.orderId);

    return (
      <Card
        key={order.orderId}
        id={`order-${order.orderId}`}
        className={`hover:shadow-md transition-all cursor-pointer ${
          highlightedOrderId === order.orderId
            ? 'border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/20 ring-2 ring-yellow-300 shadow-lg'
            : isSelected
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
              : shippingOptionsText
                ? 'border-yellow-400 bg-yellow-50 hover:border-yellow-500 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-600'
                : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => handleCardSelection(order.orderId)}
      >
        <CardContent className="p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedOrders.includes(order.orderId)}
                onCheckedChange={(checked) =>
                  handleOrderSelection(order.orderId, checked as boolean)
                }
                onClick={(e) => e.stopPropagation()} // Prevent card selection when clicking checkbox
              />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}
                  >
                    {order.orderId}
                  </div>
                  <TicketBadge orderId={order.orderId} ticketMap={ticketMap} />
                  {(order.urgency === 'high' || order.urgency === 'critical') && order.isManualUrgency && (
                    <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-0.5 font-bold text-xs">
                      <Zap className="w-3 h-3" />
                      URGENT!!!
                    </Badge>
                  )}
                </div>
                {order.fbOrderNumber && (
                  <div className="text-xs text-gray-600">
                    FB: {order.fbOrderNumber}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LinkedOrderIndicator orderId={order.orderId} variant="compact" />
              {order.isFullyPaid ? (
                <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
                  PAID
                </Badge>
              ) : (
                <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                  NOT PAID
                </Badge>
              )}
              {shippingOptionsText && (
                <Badge className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide">
                  {shippingOptionsText}
                </Badge>
              )}
              {materialType && (
                <Badge variant="secondary" className="text-xs">
                  {materialType}
                </Badge>
              )}
            </div>
          </div>

          {shippingOptionsText && (
            <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold uppercase tracking-wide text-red-700">
              Shipping Option: {shippingOptionsText}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Order Info */}
            <div className="space-y-1 text-sm">
              <div className="text-gray-600">
                <span className="font-medium">Customer:</span>{' '}
                {getCustomerInfo(order.customerId)?.name || order.customer}
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Model:</span>{' '}
                {getModelDisplayName(modelId)}
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Order Date:</span>{' '}
                {safeFormatDate(order.orderDate)}
              </div>
              {order.dueDate && (
                <div className="text-gray-600">
                  <span className="font-medium">Due Date:</span>{' '}
                  {safeFormatDate(order.dueDate)}
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div className="space-y-1 text-sm">
              <div className="font-medium text-gray-700 mb-1">
                Shipping Address:
              </div>
              {customerAddress ? (
                <div className="text-gray-600 space-y-1">
                  <div className="font-medium">
                    {customerInfo?.name || 'Customer'}
                  </div>
                  {customerInfo?.phone && (
                    <div className="text-blue-600">{customerInfo.phone}</div>
                  )}
                  <div>{customerAddress.street}</div>
                  {customerAddress.street2 && (
                    <div>{customerAddress.street2}</div>
                  )}
                  <div>
                    {customerAddress.city}, {customerAddress.state}{' '}
                    {customerAddress.zipCode}
                  </div>
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

          {/* Show other customer orders in progress */}
          {otherOrders.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-700 mb-2">
                Other orders for this customer:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {otherOrders.map((otherOrder: any) => (
                  <Badge
                    key={otherOrder.orderId}
                    variant="outline"
                    className="text-xs bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                    data-testid={`badge-other-order-${otherOrder.orderId}`}
                  >
                    {otherOrder.orderId} - {otherOrder.currentDepartment || otherOrder.department}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mb-2">
            <OrderActionButtons
              orderId={order.orderId}
              onReportKickback={(id) => {
                setSelectedOrderForKickback({ orderId: id, department: 'Shipping' });
                setKickbackModalOpen(true);
              }}
              hasKickbacks={hasKickbacks(order.orderId)}
              kickbackStatus={getKickbackStatus(order.orderId)}
              onKickbackBadgeClick={handleKickbackClick}
              showReassignButton={isAdmin}
            />
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
                // Use React router navigation for better deployment compatibility
                setLocation(`/shipping/label/${order.orderId}`);
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
              className="flex-1 text-xs h-8 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              {fulfillOrderMutation.isPending ? '⏳' : '✅'} Fulfilled
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
          <BarcodeScanner onOrderScanned={handleOrderScanned} />
        </div>

        {/* Sticky Bulk Actions */}
        {selectedOrders.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
            <div className="container mx-auto p-4 space-y-4">
              {/* Progress to Fulfilled Section */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedOrders([])}
                      size="sm"
                      data-testid="button-clear-selection"
                    >
                      Clear Selection
                    </Button>
                    <Button
                      onClick={() => bulkFulfillMutation.mutate(selectedOrders)}
                      disabled={bulkFulfillMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-bulk-fulfill"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {bulkFulfillMutation.isPending
                        ? 'Progressing...'
                        : `Progress to Fulfilled (${selectedOrders.length})`}
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Bulk Shipping Actions */}
              <BulkShippingActions
                selectedOrders={selectedOrders}
                onClearSelection={() => setSelectedOrders([])}
                shippingOrders={enrichedShippingOrders}
              />
            </div>
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
                <CardTitle>
                  Shipping Queue ({shippingOrders.length} orders)
                </CardTitle>
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
                  <div className="text-lg font-medium mb-2">
                    No orders in shipping queue
                  </div>
                  <div className="text-sm">
                    Orders will appear here when they're ready for shipping
                  </div>
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
                      {categorizedOrders.overdue.map((order: any) =>
                        renderOrderCard(order)
                      )}
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
                      {categorizedOrders.dueToday.map((order: any) =>
                        renderOrderCard(order)
                      )}
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
                      {categorizedOrders.dueTomorrow.map((order: any) =>
                        renderOrderCard(order)
                      )}
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
                      {categorizedOrders.dueThisWeek.map((order: any) =>
                        renderOrderCard(order)
                      )}
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
                      {categorizedOrders.dueLater.map((order: any) =>
                        renderOrderCard(order)
                      )}
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
                        <TicketBadge orderId={getSelectedOrder()?.orderId || ''} ticketMap={ticketMap} />
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
                  <ShippingActions
                    orderId={selectedCard || ''}
                    orderData={getSelectedOrder()}
                    onCreateLabel={() => {
                      setSelectedOrderId(selectedCard);
                      setShowLabelCreator(true);
                    }}
                  />
                  
                  {/* Linked Orders Management */}
                  <div className="mt-4">
                    <LinkedOrdersManager 
                      orderId={selectedCard || ''} 
                      currentUser={(currentUser as any)?.username || (currentUser as any)?.name || 'System'}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg font-medium mb-2">
                    Select an order to print shipping documents
                  </div>
                  <div className="text-sm">
                    Click on any order card above to see available printing
                    options
                  </div>
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

      {/* Working Shipping Details Modal - DEBUG VERSION */}
      {showShippingDialog && (
        <div
          className="fixed inset-0 z-[9999] bg-black bg-opacity-75 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
        >
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-4 border-red-500">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-red-600">
                  SHIPPING DIALOG OPEN - Order {selectedOrderId}
                </h2>
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Package Details */}
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold">Package Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Weight (lbs)
                    </label>
                    <input
                      type="number"
                      value={shippingDetails.weight}
                      onChange={(e) =>
                        setShippingDetails((prev) => ({
                          ...prev,
                          weight: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Declared Value ($)
                    </label>
                    <input
                      type="number"
                      value={shippingDetails.value}
                      onChange={(e) =>
                        setShippingDetails((prev) => ({
                          ...prev,
                          value: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="500"
                    />
                  </div>
                </div>
              </div>

              {/* Billing Options */}
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold">Billing Options</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'sender'}
                      onChange={() =>
                        setShippingDetails((prev) => ({
                          ...prev,
                          billingOption: 'sender',
                        }))
                      }
                      className="mr-2"
                    />
                    Bill to Sender (Our Account)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'receiver'}
                      onChange={() =>
                        setShippingDetails((prev) => ({
                          ...prev,
                          billingOption: 'receiver',
                        }))
                      }
                      className="mr-2"
                    />
                    Bill to Receiver
                  </label>
                </div>

                {shippingDetails.billingOption === 'receiver' && (
                  <div className="ml-6 space-y-3 p-4 bg-blue-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          UPS Account Number
                        </label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.accountNumber}
                          onChange={(e) =>
                            setShippingDetails((prev) => ({
                              ...prev,
                              receiverAccount: {
                                ...prev.receiverAccount,
                                accountNumber: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="Enter UPS account number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.zipCode}
                          onChange={(e) =>
                            setShippingDetails((prev) => ({
                              ...prev,
                              receiverAccount: {
                                ...prev.receiverAccount,
                                zipCode: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="12345"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={generateShippingLabel}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Generate Label
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kickback Report Modal */}
      <KickbackReportModal
        open={kickbackModalOpen}
        onOpenChange={(open) => {
          setKickbackModalOpen(open);
          if (!open) setSelectedOrderForKickback(null);
        }}
        orderId={selectedOrderForKickback?.orderId || ''}
        department={selectedOrderForKickback?.department || ''}
      />
    </div>
  );
}

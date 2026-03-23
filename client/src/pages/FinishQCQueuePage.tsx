import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { OrderTooltip } from '@/components/OrderTooltip';
import {
  Shield,
  ArrowLeft,
  ArrowRight,
  Search,
  CheckSquare,
  Square,
  CheckCircle,
  Clock,
  ClipboardCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';
import { useRepairOrders } from '@/hooks/useRepairOrders';

export default function FinishQCQueuePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Get repair order information
  const { isRepairOrder, repairNotesMap } = useRepairOrders();

  // Get logged-in session user for ownership checks
  const { data: sessionUser } = useQuery<any>({
    queryKey: ['/api/auth/session'],
  });

  // Derive the logged-in employee's full name (used to check order ownership)
  const loggedInEmployeeName = useMemo(() => {
    if (!sessionUser) return null;
    const first = sessionUser.firstName || '';
    const last = sessionUser.lastName || '';
    const full = `${first} ${last}`.trim();
    return full || null;
  }, [sessionUser]);

  // Admin / production-manager override: can accept any order
  const isAdminUser = useMemo(() => {
    if (!sessionUser) return false;
    const role = (sessionUser.role || '').toUpperCase();
    return role === 'ADMIN' || sessionUser.username === 'agrace';
  }, [sessionUser]);

  // Get orders in Finish QC department
  const { data: finishQCOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/orders/department/Finish QC'],
  });

  // All orders (for department count summaries)
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Split orders: unaccepted vs accepted
  const awaitingOrders = useMemo(
    () => finishQCOrders.filter((o: any) => !o.finishAcceptedAt),
    [finishQCOrders]
  );
  const acceptedOrders = useMemo(
    () => finishQCOrders.filter((o: any) => !!o.finishAcceptedAt),
    [finishQCOrders]
  );

  // Filter accepted orders by search (checkboxes only apply to accepted)
  const filteredAccepted = useMemo(() => {
    if (!searchQuery.trim()) return acceptedOrders;
    const query = searchQuery.toLowerCase().trim();
    return acceptedOrders.filter((order: any) => {
      const orderId = order.orderId?.toLowerCase() || '';
      const fbNumber = order.fbOrderNumber?.toLowerCase() || '';
      const displayOrderId = getDisplayOrderId(order.orderId)?.toLowerCase() || '';
      return orderId.includes(query) || fbNumber.includes(query) || displayOrderId.includes(query);
    });
  }, [acceptedOrders, searchQuery]);

  // Filter awaiting orders by search
  const filteredAwaiting = useMemo(() => {
    if (!searchQuery.trim()) return awaitingOrders;
    const query = searchQuery.toLowerCase().trim();
    return awaitingOrders.filter((order: any) => {
      const orderId = order.orderId?.toLowerCase() || '';
      const fbNumber = order.fbOrderNumber?.toLowerCase() || '';
      const displayOrderId = getDisplayOrderId(order.orderId)?.toLowerCase() || '';
      return orderId.includes(query) || fbNumber.includes(query) || displayOrderId.includes(query);
    });
  }, [awaitingOrders, searchQuery]);

  // Count orders in adjacent departments
  const prevDeptCount = useMemo(
    () => (allOrders as any[]).filter((o: any) => o.currentDepartment === 'Finish').length,
    [allOrders]
  );
  const paintCount = useMemo(
    () => (allOrders as any[]).filter((o: any) => o.currentDepartment === 'Paint').length,
    [allOrders]
  );

  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // ── Scan / search ──────────────────────────────────────────────────────────
  const handleOrderScanned = (orderId: string) => {
    const orderExists = finishQCOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setHighlightedOrderId(orderId);
      setTimeout(() => {
        document.getElementById(`order-${orderId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      toast.success(`Order ${orderId} highlighted`);
    } else {
      toast.error(`Order ${orderId} is not in the Finish QC department`);
    }
  };

  const handleOrderSearchSelect = (order: any) => {
    const orderExists = finishQCOrders.some((o: any) => o.orderId === order.orderId);
    if (orderExists) {
      setHighlightedOrderId(order.orderId);
      setTimeout(() => {
        document.getElementById(`order-${order.orderId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      toast.success(`Order ${order.orderId} highlighted`);
    } else {
      toast.error(`Order ${order.orderId} is not in the Finish QC department`);
    }
  };

  const handleSearchWithSelection = (query: string) => {
    setSearchQuery(query);

    if (query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      const matchingOrders = finishQCOrders.filter((order: any) => {
        const orderId = order.orderId?.toLowerCase() || '';
        const fbNumber = order.fbOrderNumber?.toLowerCase() || '';
        const displayOrderId = getDisplayOrderId(order.orderId)?.toLowerCase() || '';
        return orderId.includes(searchTerm) || fbNumber.includes(searchTerm) || displayOrderId.includes(searchTerm);
      });

      if (matchingOrders.length > 0) {
        setHighlightedOrderId(matchingOrders[0].orderId);
        setTimeout(() => {
          document.getElementById(`order-${matchingOrders[0].orderId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 100);
        toast.success(`${matchingOrders.length} order(s) found — first highlighted`);
      } else {
        setHighlightedOrderId(null);
        toast.error('No matching orders found');
      }
    } else {
      setHighlightedOrderId(null);
    }
  };

  // ── Multi-select (accepted orders only → progress to Paint) ───────────────
  const handleOrderSelect = (orderId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (isSelected) newSelected.add(orderId);
    else newSelected.delete(orderId);
    setSelectedOrders(newSelected);
    setSelectAll(newSelected.size === filteredAccepted.length && filteredAccepted.length > 0);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredAccepted.map((o: any) => o.orderId)));
    }
    setSelectAll(!selectAll);
  };

  React.useEffect(() => {
    setSelectAll(
      selectedOrders.size === filteredAccepted.length && filteredAccepted.length > 0
    );
  }, [selectedOrders.size, filteredAccepted.length]);

  // ── Accept mutation ────────────────────────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: async ({ orderId, technicianName }: { orderId: string; technicianName: string }) =>
      apiRequest(`/api/orders/${orderId}/finish-accept`, {
        method: 'POST',
        body: { technicianName },
      }),
    onSuccess: (_data, { orderId }) => {
      toast.success(`Order accepted`);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department/Finish QC'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (err: any) => {
      const msg = err?.message || 'Failed to accept order';
      toast.error(msg);
    },
  });

  // ── Progress to Paint mutation ─────────────────────────────────────────────
  const progressToPaint = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const result = await apiRequest('/api/orders/progress-department', {
        method: 'POST',
        body: {
          orderIds,
          toDepartment: 'Paint',
          fromDepartment: 'Finish QC',
        },
      });
      if (result.failed && result.failed.length > 0) {
        const failureDetails = result.failed.map((f: any) => `${f.orderId} (${f.reason})`).join(', ');
        throw new Error(`Failed to progress ${result.failed.length} order(s): ${failureDetails}`);
      }
      return result;
    },
    onSuccess: (result) => {
      const successCount = result.success?.length || 0;
      toast.success(`Progressed ${successCount} order${successCount !== 1 ? 's' : ''} to Paint`);
      setSelectedOrders(new Set());
      setSelectAll(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department/Finish QC'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to progress orders');
    },
  });

  const handleProgressToPaint = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }
    progressToPaint.mutate(Array.from(selectedOrders));
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Determine if the logged-in user can accept a given order
  const canAcceptOrder = (order: any): boolean => {
    if (isAdminUser) return true;
    if (!loggedInEmployeeName) return false;
    const assignedTo = order.assignedTechnician || '';
    return assignedTo.toLowerCase() === loggedInEmployeeName.toLowerCase();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Finish QC Department Manager</h1>
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

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
              {searchQuery && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setHighlightedOrderId(null);
                  }}
                >
                  Clear
                </Button>
              )}
              {highlightedOrderId && (
                <Button variant="outline" onClick={() => setHighlightedOrderId(null)}>
                  Clear Highlight
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Finish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {prevDeptCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

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

      {/* ── SECTION A: AWAITING QC ACCEPTANCE ─────────────────────────────── */}
      <Card>
        <CardHeader className="bg-amber-50 dark:bg-amber-900/20">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <span>Awaiting QC Acceptance</span>
            <Badge
              variant="outline"
              className="ml-2 border-amber-300 text-amber-700 dark:text-amber-300"
            >
              {awaitingOrders.length} Orders
            </Badge>
            {searchQuery && filteredAwaiting.length !== awaitingOrders.length && (
              <Badge variant="secondary" className="ml-1">
                {filteredAwaiting.length} shown
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            QC technicians must accept their assigned orders before beginning inspection
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {filteredAwaiting.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              {awaitingOrders.length === 0
                ? 'All orders have been accepted — great work!'
                : `No orders matching "${searchQuery}"`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAwaiting.map((order: any) => {
                const isHighlighted = highlightedOrderId === order.orderId;
                const canAccept = canAcceptOrder(order);
                return (
                  <div
                    key={order.orderId}
                    id={`order-${order.orderId}`}
                    className={`relative transition-all duration-200 ${
                      isHighlighted
                        ? 'ring-4 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg'
                        : ''
                    }`}
                  >
                    <OrderTooltip
                      order={order}
                      stockModels={stockModels as any[]}
                      showPaintAndTexture={true}
                      showHoverText={false}
                      disableHoverPopup={true}
                      showTechnician={true}
                      isRepair={isRepairOrder(order.orderId)}
                      repairNotes={repairNotesMap.get(order.orderId)}
                      className="border-l-amber-500"
                    />
                    {/* Accept button overlay */}
                    <div className="mt-1 px-1">
                      {canAccept ? (
                        <Button
                          size="sm"
                          className="w-full h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                          disabled={acceptMutation.isPending}
                          onClick={() =>
                            acceptMutation.mutate({
                              orderId: order.orderId,
                              technicianName: order.assignedTechnician || loggedInEmployeeName || '',
                            })
                          }
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" />
                          Accept for QC
                        </Button>
                      ) : (
                        <div className="text-xs text-center text-gray-400 dark:text-gray-500 py-1">
                          Assigned to{' '}
                          <span className="font-medium text-gray-600 dark:text-gray-400">
                            {order.assignedTechnician || 'unassigned'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION B: ACCEPTED / IN QC ───────────────────────────────────── */}
      <Card>
        <CardHeader className="bg-green-50 dark:bg-green-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Accepted / In QC</span>
              <Badge
                variant="outline"
                className="ml-2 border-green-300 text-green-700 dark:text-green-300"
              >
                {acceptedOrders.length} Orders
              </Badge>
              {searchQuery && filteredAccepted.length !== acceptedOrders.length && (
                <Badge variant="secondary" className="ml-1">
                  {filteredAccepted.length} shown
                </Badge>
              )}
            </div>

            {/* Bulk selection controls */}
            {filteredAccepted.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2"
                >
                  {selectAll ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectAll ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedOrders.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedOrders(new Set());
                      setSelectAll(false);
                    }}
                  >
                    Clear ({selectedOrders.size})
                  </Button>
                )}
              </div>
            )}
          </CardTitle>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            Select accepted orders and click <strong>Progress to Paint</strong> when QC is complete
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {filteredAccepted.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              {acceptedOrders.length === 0
                ? 'No accepted orders yet — technicians must accept orders above to begin QC'
                : `No accepted orders matching "${searchQuery}"`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAccepted.map((order: any) => {
                const isSelected = selectedOrders.has(order.orderId);
                const isHighlighted = highlightedOrderId === order.orderId;
                return (
                  <div
                    key={order.orderId}
                    id={`order-${order.orderId}`}
                    className={`relative transition-all duration-200 ${
                      isHighlighted
                        ? 'ring-4 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg'
                        : isSelected
                        ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg'
                        : ''
                    }`}
                  >
                    <OrderTooltip
                      order={order}
                      stockModels={stockModels as any[]}
                      showPaintAndTexture={true}
                      showHoverText={false}
                      disableHoverPopup={true}
                      showTechnician={true}
                      isRepair={isRepairOrder(order.orderId)}
                      repairNotes={repairNotesMap.get(order.orderId)}
                      className={`border-l-green-500 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    />
                    {/* Accepted-by badge */}
                    {order.finishAcceptedAt && (
                      <div className="flex items-center gap-1 mt-1 px-2 py-1 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800 mx-1">
                        <CheckCircle className="w-3 h-3 shrink-0" />
                        <span className="font-medium truncate">{order.finishAcceptedBy}</span>
                        <span className="text-gray-400 shrink-0">
                          · {format(new Date(order.finishAcceptedAt), 'M/d h:mm a')}
                        </span>
                      </div>
                    )}
                    {/* Checkbox for progress selection */}
                    <div className="absolute top-2 right-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleOrderSelect(order.orderId, checked as boolean)
                        }
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

      {/* Floating Paint Progression Button */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  {selectedOrders.size} order
                  {selectedOrders.size > 1 ? 's' : ''} selected for Paint
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setSelectedOrders(new Set());
                    setSelectAll(false);
                  }}
                  variant="outline"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleProgressToPaint}
                  disabled={selectedOrders.size === 0 || progressToPaint.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressToPaint.isPending
                    ? 'Progressing...'
                    : `Progress to Paint (${selectedOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Paintbrush,
  ArrowLeft,
  ArrowRight,
  Users,
  CheckSquare,
  Square,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAdminUser } from '@/config/userPermissions';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { useLocation } from 'wouter';
import { OrderSearchBox } from '@/components/OrderSearchBox';
import { SalesOrderModal } from '@/components/SalesOrderModal';
import TicketBadge, { useOrderTicketCounts } from '@/components/TicketBadge';
import KickbackReportModal from '@/components/KickbackReportModal';
import OrderActionButtons from '@/components/OrderActionButtons';
import DepartmentOrderNotes from '@/components/DepartmentOrderNotes';

// ── Due-date bucket colours ───────────────────────────────────────────────────
const BUCKET_STYLES: Record<
  string,
  { label: string; heading: string; base: string; selected: string }
> = {
  overdue: {
    label: '🚨 Overdue',
    heading: 'text-red-600 dark:text-red-400',
    base: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700',
    selected:
      'bg-red-100 dark:bg-red-800/40 border-red-400 dark:border-red-600 ring-2 ring-red-300 dark:ring-red-700',
  },
  dueToday: {
    label: '🔥 Due Today',
    heading: 'text-orange-600 dark:text-orange-400',
    base: 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700',
    selected:
      'bg-orange-100 dark:bg-orange-800/40 border-orange-400 dark:border-orange-600 ring-2 ring-orange-300 dark:ring-orange-700',
  },
  dueTomorrow: {
    label: '⚡ Due Tomorrow',
    heading: 'text-yellow-600 dark:text-yellow-400',
    base: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700',
    selected:
      'bg-yellow-100 dark:bg-yellow-800/40 border-yellow-400 dark:border-yellow-600 ring-2 ring-yellow-300 dark:ring-yellow-700',
  },
  dueThisWeek: {
    label: '📅 Due This Week',
    heading: 'text-blue-600 dark:text-blue-400',
    base: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700',
    selected:
      'bg-blue-100 dark:bg-blue-800/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-300 dark:ring-blue-700',
  },
  dueNextWeek: {
    label: '📋 Due Next Week',
    heading: 'text-green-600 dark:text-green-400',
    base: 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700',
    selected:
      'bg-green-100 dark:bg-green-800/40 border-green-400 dark:border-green-600 ring-2 ring-green-300 dark:ring-green-700',
  },
  futureDue: {
    label: '📆 Future Orders',
    heading: 'text-gray-600 dark:text-gray-400',
    base: 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700',
    selected:
      'bg-gray-100 dark:bg-gray-800/40 border-gray-400 dark:border-gray-600 ring-2 ring-gray-300 dark:ring-gray-700',
  },
  noDueDate: {
    label: '❓ No Due Date',
    heading: 'text-gray-500 dark:text-gray-400',
    base: 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700',
    selected:
      'bg-gray-100 dark:bg-gray-800/40 border-gray-400 dark:border-gray-600 ring-2 ring-gray-300 dark:ring-gray-700',
  },
};

const BUCKET_ORDER = [
  'overdue',
  'dueToday',
  'dueTomorrow',
  'dueThisWeek',
  'dueNextWeek',
  'futureDue',
  'noDueDate',
] as const;
type BucketKey = (typeof BUCKET_ORDER)[number];
type CategorizedOrders = Record<BucketKey, any[]>;

function categorizeOrders(orders: any[]): CategorizedOrders {
  const today = new Date();
  const todayNorm = new Date(today);
  todayNorm.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayNorm.getTime() + 86400000);
  const nextWeek = new Date(todayNorm.getTime() + 7 * 86400000);
  const twoWeeks = new Date(todayNorm.getTime() + 14 * 86400000);

  const result: CategorizedOrders = {
    overdue: [],
    dueToday: [],
    dueTomorrow: [],
    dueThisWeek: [],
    dueNextWeek: [],
    futureDue: [],
    noDueDate: [],
  };

  for (const order of orders) {
    if (!order.dueDate) {
      result.noDueDate.push(order);
      continue;
    }
    const d = new Date(order.dueDate);
    d.setHours(0, 0, 0, 0);
    if (d < todayNorm) result.overdue.push(order);
    else if (d.getTime() === todayNorm.getTime()) result.dueToday.push(order);
    else if (d.getTime() === tomorrow.getTime()) result.dueTomorrow.push(order);
    else if (d <= nextWeek) result.dueThisWeek.push(order);
    else if (d <= twoWeeks) result.dueNextWeek.push(order);
    else result.futureDue.push(order);
  }

  const sortFn = (a: any, b: any) => {
    if (a.dueDate && b.dueDate) {
      const cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (cmp !== 0) return cmp;
    }
    return a.orderId.localeCompare(b.orderId);
  };

  for (const key of BUCKET_ORDER) {
    if (key === 'noDueDate') {
      result[key].sort((a, b) => a.orderId.localeCompare(b.orderId));
    } else {
      result[key].sort(sortFn);
    }
  }
  return result;
}

export default function FinishQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [salesOrderModalOpen, setSalesOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [kickbackModalOpen, setKickbackModalOpen] = useState(false);
  const [selectedOrderForKickback, setSelectedOrderForKickback] = useState<{
    orderId: string;
    department: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });
  const isAdmin = isAdminUser(currentUser);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: finishTechniciansData = [] } = useQuery({
    queryKey: ['/api/employees/finish-technicians'],
    staleTime: 0,
    refetchOnMount: true,
  });
  const finishTechnicians = Array.isArray(finishTechniciansData)
    ? finishTechniciansData.map((tech: any) => tech.name)
    : [];

  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/department/Finish'],
  });

  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000,
  });


  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // ── Derived collections ────────────────────────────────────────────────────
  const finishOrders = useMemo(() => allOrders as any[], [allOrders]);
  const categorizedOrders = useMemo(() => categorizeOrders(finishOrders), [finishOrders]);

  const cncCount = useMemo(
    () => (allOrders as any[]).filter((o: any) => o.currentDepartment === 'CNC').length,
    [allOrders]
  );
  const paintCount = useMemo(
    () => (allOrders as any[]).filter((o: any) => o.currentDepartment === 'Paint').length,
    [allOrders]
  );

  const orderIdsForTickets = useMemo(
    () => finishOrders.map((o: any) => o.orderId),
    [finishOrders]
  );
  const { data: ticketMap } = useOrderTicketCounts(orderIdsForTickets);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const hasKickbacks = (orderId: string) =>
    (allKickbacks as any[]).some((k: any) => k.orderId === orderId);

  const getKickbackStatus = (orderId: string) => {
    const ks = (allKickbacks as any[]).filter((k: any) => k.orderId === orderId);
    if (ks.length === 0) return null;
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    return ks.reduce(
      (h: string, k: any) =>
        priorities.indexOf(k.priority) < priorities.indexOf(h) ? k.priority : h,
      'LOW'
    );
  };

  // ── Multi-select ───────────────────────────────────────────────────────────
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === finishOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(finishOrders.map((o: any) => o.orderId)));
    }
  };

  const handleClearSelection = () => setSelectedOrders(new Set());

  // ── Mutations ──────────────────────────────────────────────────────────────
  const progressMutation = useMutation({
    mutationFn: async ({
      orderIds,
      technician,
    }: {
      orderIds: string[];
      technician: string;
    }) =>
      apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds,
          department: 'Finish QC',
          status: 'IN_PROGRESS',
          assignedTechnician: technician,
        }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department/Finish'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department', 'Finish QC'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });

      const failed = data?.failedOrders ?? [];
      if (failed.length > 0) {
        toast.error(`${failed.length} order(s) could not be progressed`);
      } else {
        toast.success(`${selectedOrders.size} orders moved to Finish QC`);
      }
      setSelectedOrders(new Set());
      setSelectedTechnician('');
    },
    onError: () => toast.error('Failed to progress orders'),
  });

  const handleProgressOrders = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select orders to progress');
      return;
    }
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    progressMutation.mutate({
      orderIds: Array.from(selectedOrders),
      technician: selectedTechnician,
    });
  };

  // ── Scanner / search ───────────────────────────────────────────────────────
  const handleOrderScanned = (orderId: string) => {
    const exists = finishOrders.some((o: any) => o.orderId === orderId);
    if (exists) {
      setSelectedOrders((prev) => new Set([...Array.from(prev), orderId]));
      toast.success(`Order ${orderId} selected`);
    } else {
      toast.error(`Order ${orderId} is not in Finish`);
    }
  };

  const handleOrderSearchSelect = (order: any) => {
    const exists = finishOrders.some((o: any) => o.orderId === order.orderId);
    if (exists) {
      setHighlightedOrderId(order.orderId);
      setTimeout(() => {
        document.getElementById(`order-${order.orderId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      toast.success(`Order ${order.orderId} highlighted`);
    } else {
      toast.error(`Order ${order.orderId} is not in Finish`);
    }
  };

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderOrderCard = (order: any, bucketStyle: (typeof BUCKET_STYLES)[string]) => {
    const isSelected = selectedOrders.has(order.orderId);
    const isHighlighted = highlightedOrderId === order.orderId;
    const kickbackStatus = getKickbackStatus(order.orderId);

    const cardClass = isHighlighted
      ? 'border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/20 ring-2 ring-yellow-300 shadow-lg'
      : isSelected
      ? bucketStyle.selected
      : bucketStyle.base;

    return (
      <div key={order.orderId} className="relative">
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handleSelectOrder(order.orderId)}
            className="bg-white dark:bg-gray-800 border-2"
          />
        </div>

        <Card id={`order-${order.orderId}`} className={`${cardClass} pl-8`}>
          <CardContent className="p-3">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{getDisplayOrderId(order)}</span>
                <TicketBadge orderId={order.orderId} ticketMap={ticketMap} />
                {(order.urgency === 'high' || order.urgency === 'critical') &&
                  order.isManualUrgency && (
                    <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-0.5 font-bold text-xs">
                      <Zap className="w-3 h-3" />
                      URGENT!!!
                    </Badge>
                  )}
                {order.fbOrderNumber && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1 py-0 bg-blue-50 dark:bg-blue-900/20 border-blue-300"
                  >
                    FB: {order.fbOrderNumber}
                  </Badge>
                )}
              </div>
              {order.dueDate ? (
                <Badge
                  variant={new Date(order.dueDate) < new Date() ? 'destructive' : 'outline'}
                  className="text-xs"
                >
                  Due: {format(new Date(order.dueDate), 'M/d')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">No Due Date</Badge>
              )}
            </div>

            {/* Customer / model */}
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {order.customerName}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {getModelDisplayName(order.modelId)}
            </div>

            <DepartmentOrderNotes notes={order.notes} />

            {/* Action row */}
            <div className="flex items-center gap-2 flex-wrap">
              {order.isPaid && (
                <Badge variant="secondary" className="text-xs">PAID</Badge>
              )}
              <OrderActionButtons
                orderId={order.orderId}
                onSalesOrderView={(id) => {
                  setSelectedOrderId(id);
                  setSalesOrderModalOpen(true);
                }}
                onReportKickback={(id) => {
                  setSelectedOrderForKickback({ orderId: id, department: 'Finish' });
                  setKickbackModalOpen(true);
                }}
                hasKickbacks={hasKickbacks(order.orderId)}
                kickbackStatus={kickbackStatus}
                onKickbackBadgeClick={() => setLocation('/kickback-tracking')}
                showReassignButton={isAdmin}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Section renderer (due-date buckets) ───────────────────────────────────
  const renderSection = (categorized: CategorizedOrders) => {
    const hasAny = BUCKET_ORDER.some((k) => categorized[k].length > 0);
    if (!hasAny) return null;

    return (
      <div className="space-y-6">
        {BUCKET_ORDER.map((bucket) => {
          const orders = categorized[bucket];
          if (orders.length === 0) return null;
          const style = BUCKET_STYLES[bucket];
          return (
            <div key={bucket}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className={`text-lg font-semibold ${style.heading}`}>
                  {style.label} ({orders.length})
                </h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {orders.map((order: any) => renderOrderCard(order, style))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <Paintbrush className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Finish Department Manager</h1>
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Order Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <OrderSearchBox
              orders={finishOrders}
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

      <ReturnsRepairsSection repairDepartment="Finish" />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              Finish QC
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

      {/* Technician selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Users className="h-4 w-4 text-gray-600 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
              Assign Technician for Finish QC:
            </span>
            <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
              <SelectTrigger className="w-48">
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
            {!selectedTechnician && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Select a technician to enable Move to Finish QC
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue */}
      {finishOrders.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-gray-500 dark:text-gray-400">
            No orders currently in Finish department
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>Finish Queue</span>
                <Badge variant="outline">{finishOrders.length} Orders</Badge>
              </div>
              {finishOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="flex items-center gap-2"
                  >
                    {selectedOrders.size === finishOrders.length ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {selectedOrders.size === finishOrders.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedOrders.size > 0 && (
                    <Button variant="outline" size="sm" onClick={handleClearSelection}>
                      Clear ({selectedOrders.size})
                    </Button>
                  )}
                </div>
              )}
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Select orders and assign a technician, then click{' '}
              <strong>Move to Finish QC</strong> to progress them
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {renderSection(categorizedOrders)}
          </CardContent>
        </Card>
      )}

      {/* Floating progression bar */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected
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
                  onClick={handleProgressOrders}
                  disabled={
                    selectedOrders.size === 0 ||
                    progressMutation.isPending ||
                    !selectedTechnician
                  }
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressMutation.isPending
                    ? 'Progressing…'
                    : `Move to Finish QC (${selectedOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SalesOrderModal
        isOpen={salesOrderModalOpen}
        onClose={() => setSalesOrderModalOpen(false)}
        orderId={selectedOrderId}
      />
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

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { PIPELINE_DEPARTMENTS, DEPARTMENT_COLORS, type PipelineDepartment } from '@/constants/pipelineDepartments';
import { calculateFlowPressure, type PressureLevel } from '@/utils/calculateFlowPressure';
import { Filter, X, Printer, LayoutGrid, BarChart2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

type ScheduleStatus =
  | 'on-schedule'
  | 'dept-overdue'
  | 'cannot-meet-due'
  | 'critical';

interface OrderDetail {
  orderId: string;
  modelId: string;
  dueDate: Date;
  daysInDept: number;
  scheduleStatus: ScheduleStatus;
  fbOrderNumber?: string;
  expectedDepartment?: string;
}

const statusBorderColors: Record<ScheduleStatus, string> = {
  'on-schedule': 'border-transparent',
  'dept-overdue': 'border-yellow-400',
  'cannot-meet-due': 'border-orange-500',
  critical: 'border-red-600',
};

const statusDotColors: Record<ScheduleStatus, string> = {
  'on-schedule': 'bg-transparent',
  'dept-overdue': 'bg-yellow-400',
  'cannot-meet-due': 'bg-orange-500',
  critical: 'bg-red-600',
};

const pressureColors: Record<PressureLevel, { arrow: string; badge: string; dot: string }> = {
  LOW:    { arrow: 'text-green-500',  badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',  dot: 'bg-green-500'  },
  MEDIUM: { arrow: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
  HIGH:   { arrow: 'text-red-500',    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',    dot: 'bg-red-500'    },
};

function getDeptColor(dept: string | undefined): { bg: string; hex: string; text: string; border: string } {
  if (!dept) return { bg: 'bg-gray-400', hex: '#9CA3AF', text: 'text-white', border: 'border-gray-400' };
  return DEPARTMENT_COLORS[dept as PipelineDepartment] || { bg: 'bg-gray-400', hex: '#9CA3AF', text: 'text-white', border: 'border-gray-400' };
}

// ── Pressure arrow between departments ───────────────────────────────────────
const FlowPressureIndicator = ({
  upstreamName,
  downstreamName,
  upstreamCount,
  downstreamCount,
}: {
  upstreamName: string;
  downstreamName: string;
  upstreamCount: number;
  downstreamCount: number;
}) => {
  const [hovered, setHovered] = useState(false);
  const { ratio, pressureLevel, timeToClearDays } = calculateFlowPressure(upstreamCount, downstreamCount);
  const colors = pressureColors[pressureLevel];

  return (
    <div
      className="relative flex-shrink-0 flex flex-col items-center justify-start pt-5 w-7"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`flex flex-col items-center gap-0.5 cursor-default select-none`}>
        <div className={`w-px h-5 ${colors.dot}`} />
        <svg width="14" height="10" viewBox="0 0 14 10" className="block">
          <polygon
            points="7,10 0,0 14,0"
            className={pressureLevel === 'LOW' ? 'fill-green-500' : pressureLevel === 'MEDIUM' ? 'fill-yellow-500' : 'fill-red-500'}
          />
        </svg>
      </div>

      <div className={`mt-1 w-2.5 h-2.5 rounded-full ${colors.dot} opacity-80`} />

      {hovered && (
        <div className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-gray-900" />
          <div className={`font-bold mb-1.5 ${pressureLevel === 'HIGH' ? 'text-red-400' : pressureLevel === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'}`}>
            Flow Pressure: {pressureLevel}
          </div>
          <div className="space-y-0.5 text-gray-200">
            <div>{upstreamCount} orders upstream <span className="text-gray-400">({upstreamName})</span></div>
            <div>{downstreamCount} orders downstream <span className="text-gray-400">({downstreamName})</span></div>
            <div className="mt-1">
              Ratio: <span className="font-mono font-semibold">{ratio.toFixed(2)}×</span>
            </div>
            <div>
              Est. clearance: <span className="font-semibold">{timeToClearDays} days</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700 text-gray-400 text-[10px] leading-tight">
            {upstreamCount > downstreamCount
              ? `More work arriving from ${upstreamName} than ${downstreamName} is processing. This may create a backlog.`
              : `${downstreamName} is keeping pace with incoming work from ${upstreamName}.`}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Order pixel (high-volume) ─────────────────────────────────────────────────
const OrderPixel = ({
  order,
  currentDept,
  onClick,
}: {
  order: OrderDetail;
  currentDept: string;
  onClick?: () => void;
}) => {
  const isCorrectDept =
    order.expectedDepartment &&
    order.expectedDepartment.toLowerCase() === currentDept.toLowerCase();
  const deptColor = isCorrectDept ? { hex: '#D1D5DB' } : getDeptColor(order.expectedDepartment);
  const hasProblem = order.scheduleStatus !== 'on-schedule';

  return (
    <div
      className={`w-2.5 h-2.5 cursor-pointer hover:scale-150 transition-transform rounded-sm ${
        hasProblem && !isCorrectDept ? `border ${statusBorderColors[order.scheduleStatus]}` : ''
      }`}
      style={{ backgroundColor: deptColor.hex }}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - Expected: ${order.expectedDepartment || 'N/A'} - ${order.scheduleStatus} (${order.daysInDept} days)${isCorrectDept ? ' ✓ In correct dept' : ' ⚠ Wrong dept'}`}
    />
  );
};

// ── Order chip (low-volume) ───────────────────────────────────────────────────
const OrderChip = ({
  order,
  currentDept,
  onClick,
  getModelDisplayName,
}: {
  order: OrderDetail;
  currentDept: string;
  onClick?: () => void;
  getModelDisplayName?: (modelId: string) => string;
}) => {
  const isCorrectDept =
    order.expectedDepartment &&
    order.expectedDepartment.toLowerCase() === currentDept.toLowerCase();
  const deptColor = isCorrectDept ? { hex: '#E5E7EB' } : getDeptColor(order.expectedDepartment);
  const textColor = isCorrectDept ? 'text-gray-600' : 'text-white';
  const hasProblem = order.scheduleStatus !== 'on-schedule';

  return (
    <div
      className={`relative px-2 py-1 rounded text-xs cursor-pointer hover:brightness-95 transition-all ${textColor} font-medium ${
        !isCorrectDept && hasProblem ? `border-2 ${statusBorderColors[order.scheduleStatus]}` : 'border border-transparent'
      }`}
      style={{ backgroundColor: deptColor.hex }}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - Expected: ${order.expectedDepartment || 'N/A'} - ${getModelDisplayName ? getModelDisplayName(order.modelId) : order.modelId} - ${order.scheduleStatus} (${order.daysInDept} days)${isCorrectDept ? ' ✓ In correct dept' : ' ⚠ Wrong dept'}`}
    >
      {getDisplayOrderId(order)}
      {!isCorrectDept && hasProblem && (
        <span
          className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${statusDotColors[order.scheduleStatus]}`}
        />
      )}
    </div>
  );
};

type FilterMode = 'all' | 'correct' | 'incorrect';

// ── Department visualization ──────────────────────────────────────────────────
const DepartmentVisualization = ({
  department,
  orders,
  getModelDisplayName,
  onOrderClick,
  filterMode,
}: {
  department: string;
  orders: OrderDetail[];
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
  filterMode: FilterMode;
}) => {
  const visibleOrders =
    filterMode === 'correct'
      ? orders.filter(
          (o) =>
            o.expectedDepartment &&
            o.expectedDepartment.toLowerCase() === department.toLowerCase()
        )
      : filterMode === 'incorrect'
      ? orders.filter(
          (o) =>
            !o.expectedDepartment ||
            o.expectedDepartment.toLowerCase() !== department.toLowerCase()
        )
      : orders;

  const count = visibleOrders.length;

  if (count === 0) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-2">
        {filterMode === 'correct'
          ? 'None in correct dept'
          : filterMode === 'incorrect'
          ? 'All in correct dept'
          : 'No orders'}
      </div>
    );
  }

  if (count > 20) {
    return (
      <div className="grid grid-cols-10 gap-1">
        {visibleOrders.map((order) => (
          <OrderPixel
            key={order.orderId}
            order={order}
            currentDept={department}
            onClick={() => onOrderClick(order.orderId)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {visibleOrders.map((order) => (
        <OrderChip
          key={order.orderId}
          order={order}
          currentDept={department}
          getModelDisplayName={getModelDisplayName}
          onClick={() => onOrderClick(order.orderId)}
        />
      ))}
    </div>
  );
};

// ── Department Focus Panel ────────────────────────────────────────────────────
const DepartmentFocusPanel = ({
  targetDept,
  pipelineDetails,
  getModelDisplayName,
  onOrderClick,
  onClose,
}: {
  targetDept: PipelineDepartment;
  pipelineDetails: Record<string, OrderDetail[]>;
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
  onClose: () => void;
}) => {
  const targetColor = getDeptColor(targetDept);

  const allMatchingOrders: (OrderDetail & { currentDept: string })[] = [];
  for (const [dept, orders] of Object.entries(pipelineDetails)) {
    for (const o of orders) {
      if (o.expectedDepartment?.toLowerCase() === targetDept.toLowerCase()) {
        allMatchingOrders.push({ ...o, currentDept: dept });
      }
    }
  }

  const grouped = PIPELINE_DEPARTMENTS.reduce<Record<string, (OrderDetail & { currentDept: string })[]>>(
    (acc, dept) => {
      const matches = allMatchingOrders.filter((o) => o.currentDept === dept);
      if (matches.length > 0) acc[dept] = matches;
      return acc;
    },
    {}
  );

  const unknownDeptOrders = allMatchingOrders.filter(
    (o) => !PIPELINE_DEPARTMENTS.includes(o.currentDept as PipelineDepartment)
  );

  const total = allMatchingOrders.length;
  const inCorrectDept = allMatchingOrders.filter((o) => o.currentDept.toLowerCase() === targetDept.toLowerCase()).length;

  return (
    <div className="mt-4 rounded-xl border-2 p-4 space-y-3" style={{ borderColor: targetColor.hex }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: targetColor.hex }} />
          <span className="font-semibold text-sm">
            Orders expected in <span style={{ color: targetColor.hex }}>{targetDept}</span>
          </span>
          <Badge variant="outline" className="text-xs">{total} total</Badge>
          {inCorrectDept > 0 && (
            <Badge className="text-xs text-white" style={{ backgroundColor: targetColor.hex }}>
              {inCorrectDept} already here
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {total === 0 ? (
        <div className="text-sm text-muted-foreground italic text-center py-4">
          No orders are currently forecast for this department.
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([currentDept, orders]) => {
            const isHere = currentDept.toLowerCase() === targetDept.toLowerCase();
            const deptIdx = PIPELINE_DEPARTMENTS.indexOf(currentDept as PipelineDepartment);
            const targetIdx = PIPELINE_DEPARTMENTS.indexOf(targetDept);
            const isAhead = deptIdx > targetIdx;
            const isBehind = deptIdx < targetIdx;
            const currentColor = getDeptColor(currentDept);

            return (
              <div key={currentDept} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentColor.hex }} />
                  <span className="text-xs font-medium text-muted-foreground">
                    Currently in <span className="font-semibold text-foreground">{currentDept}</span>
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      isHere
                        ? 'border-green-500 text-green-600 dark:text-green-400'
                        : isAhead
                        ? 'border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-orange-400 text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {isHere ? '✓ In place' : isAhead ? '▲ Ahead' : '▼ Behind'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1 pl-4">
                  {orders.map((order) => (
                    <div
                      key={order.orderId}
                      className={`px-2 py-0.5 rounded text-xs cursor-pointer font-medium transition-all border ${
                        isBehind
                          ? `text-white hover:brightness-90 ${order.scheduleStatus !== 'on-schedule' ? statusBorderColors[order.scheduleStatus] : 'border-transparent'}`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      style={isBehind ? { backgroundColor: currentColor.hex } : {}}
                      onClick={() => onOrderClick(order.orderId)}
                      title={`${getDisplayOrderId(order)} — ${getModelDisplayName(order.modelId)} — ${order.scheduleStatus} — ${order.daysInDept} days in dept`}
                    >
                      <span>{getDisplayOrderId(order)}</span>
                      {isBehind && order.scheduleStatus !== 'on-schedule' && (
                        <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full ${statusDotColors[order.scheduleStatus]}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {unknownDeptOrders.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Currently in <span className="font-semibold text-foreground">Other</span>
              </div>
              <div className="flex flex-wrap gap-1 pl-4">
                {unknownDeptOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className="px-2 py-0.5 rounded text-xs cursor-pointer font-medium bg-gray-400 text-white hover:brightness-90 transition-all"
                    onClick={() => onOrderClick(order.orderId)}
                    title={`${getDisplayOrderId(order)} — currently in ${order.currentDept}`}
                  >
                    {getDisplayOrderId(order)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Department View (by-dept grid) ────────────────────────────────────────────
const statusLabel: Record<ScheduleStatus, { label: string; cls: string }> = {
  'on-schedule':     { label: 'On schedule',    cls: 'text-green-600 dark:text-green-400' },
  'dept-overdue':    { label: 'Dept overdue',   cls: 'text-yellow-600 dark:text-yellow-400' },
  'cannot-meet-due': { label: 'Cannot meet due',cls: 'text-orange-600 dark:text-orange-400' },
  critical:          { label: 'Critical',        cls: 'text-red-600 dark:text-red-400' },
};

function formatDue(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DepartmentView = ({
  pipelineDetails,
  getModelDisplayName,
  onOrderClick,
  showOffTrackOnly,
}: {
  pipelineDetails: Record<string, OrderDetail[]>;
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
  showOffTrackOnly: boolean;
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleDept = (dept: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 dept-view-grid">
      {PIPELINE_DEPARTMENTS.map((dept) => {
        const orders = pipelineDetails[dept] ?? [];
        const color = getDeptColor(dept);
        const deptIdx = PIPELINE_DEPARTMENTS.indexOf(dept as PipelineDepartment);
        const isCollapsed = collapsed.has(dept);

        const inPlace = orders.filter(
          (o) => o.expectedDepartment?.toLowerCase() === dept.toLowerCase()
        );
        const shouldProgress = orders.filter(
          (o) => {
            const expIdx = PIPELINE_DEPARTMENTS.indexOf(o.expectedDepartment as PipelineDepartment);
            return expIdx !== -1 && expIdx > deptIdx;
          }
        );
        const aheadOfSchedule = orders.filter(
          (o) => {
            const expIdx = PIPELINE_DEPARTMENTS.indexOf(o.expectedDepartment as PipelineDepartment);
            return expIdx !== -1 && expIdx < deptIdx;
          }
        );
        const noExpected = orders.filter(
          (o) => !o.expectedDepartment || !PIPELINE_DEPARTMENTS.includes(o.expectedDepartment as PipelineDepartment)
        );

        return (
          <div
            key={dept}
            className="rounded-xl border overflow-hidden dept-card"
            style={{ borderColor: color.hex }}
          >
            {/* Header — click to collapse/expand */}
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
              style={{ backgroundColor: color.hex }}
              onClick={() => toggleDept(dept)}
            >
              <div className="flex items-center gap-2">
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-white/80" />
                  : <ChevronDown className="w-4 h-4 text-white/80" />
                }
                <span className="font-bold text-white text-sm">{dept}</span>
              </div>
              <span className="bg-white/20 text-white text-xs font-bold rounded-full px-2.5 py-0.5">
                {orders.length - aheadOfSchedule.length} order{orders.length - aheadOfSchedule.length !== 1 ? 's' : ''}
              </span>
            </div>

            {!isCollapsed && (
            <div className="p-3 space-y-3 bg-white dark:bg-gray-900">
              {(showOffTrackOnly
                ? shouldProgress.length === 0
                : orders.length - aheadOfSchedule.length === 0
              ) && (
                <div className="text-xs text-gray-400 italic text-center py-3">
                  {showOffTrackOnly ? 'All on track' : 'Empty'}
                </div>
              )}

              {/* In correct place — hidden when off-track filter is active */}
              {!showOffTrackOnly && inPlace.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    In correct place ({inPlace.length})
                  </div>
                  <OrderTable orders={inPlace} getModelDisplayName={getModelDisplayName} onOrderClick={onOrderClick} rowBg="bg-green-50 dark:bg-green-950/20" />
                </div>
              )}
              {/* Needs to move forward (behind expected) */}
              {shouldProgress.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                    Should be further ahead ({shouldProgress.length})
                  </div>
                  <OrderTable orders={shouldProgress} getModelDisplayName={getModelDisplayName} onOrderClick={onOrderClick} rowBg="bg-orange-50 dark:bg-orange-950/20" showExpected />
                </div>
              )}

              {/* No forecast */}
              {noExpected.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                    No forecast ({noExpected.length})
                  </div>
                  <OrderTable orders={noExpected} getModelDisplayName={getModelDisplayName} onOrderClick={onOrderClick} rowBg="bg-gray-50 dark:bg-gray-800/40" />
                </div>
              )}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const OrderTable = ({
  orders,
  getModelDisplayName,
  onOrderClick,
  rowBg,
  showExpected = false,
}: {
  orders: OrderDetail[];
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
  rowBg: string;
  showExpected?: boolean;
}) => (
  <div className="rounded overflow-hidden border border-gray-200 dark:border-gray-700">
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
          <th className="text-left px-2 py-1 font-medium">Order</th>
          <th className="text-left px-2 py-1 font-medium">Model</th>
          {showExpected && <th className="text-left px-2 py-1 font-medium">Forecast</th>}
          <th className="text-left px-2 py-1 font-medium">Due</th>
          <th className="text-left px-2 py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order, i) => {
          const st = statusLabel[order.scheduleStatus] ?? { label: order.scheduleStatus, cls: '' };
          return (
            <tr
              key={order.orderId}
              className={`${i % 2 === 0 ? rowBg : 'bg-white dark:bg-gray-900'} cursor-pointer hover:brightness-95 transition-colors`}
              onClick={() => onOrderClick(order.orderId)}
            >
              <td className="px-2 py-1 font-mono font-semibold">{getDisplayOrderId(order)}</td>
              <td className="px-2 py-1 text-gray-600 dark:text-gray-300 truncate max-w-[90px]">{getModelDisplayName(order.modelId)}</td>
              {showExpected && (
                <td className="px-2 py-1 text-gray-500 dark:text-gray-400 truncate max-w-[80px]">{order.expectedDepartment ?? '—'}</td>
              )}
              <td className="px-2 py-1 whitespace-nowrap">{formatDue(order.dueDate)}</td>
              <td className={`px-2 py-1 whitespace-nowrap font-medium ${st.cls}`}>{st.label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineVisualization() {
  const [, navigate] = useLocation();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [focusDept, setFocusDept] = useState<PipelineDepartment | null>(null);
  const [viewMode, setViewMode] = useState<'pipeline' | 'department'>('pipeline');
  const [showOffTrackOnly, setShowOffTrackOnly] = useState(false);
  const [printDept, setPrintDept] = useState<string>('all');

  const { data: pipelineCounts, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ['/api/orders/pipeline-counts'],
    refetchInterval: 30000,
  });

  const { data: pipelineDetails, isLoading: detailsLoading } = useQuery<Record<string, OrderDetail[]>>({
    queryKey: ['/api/orders/pipeline-details'],
    refetchInterval: 30000,
  });

  const { data: ytdShipped } = useQuery<{ count: number; year: number }>({
    queryKey: ['/api/orders/ytd-shipped-count'],
    refetchInterval: 60000,
  });

  const { data: stockModels = [] } = useQuery({ queryKey: ['/api/stock-models'] });

  const getModelDisplayName = (modelId: string) => {
    const models = stockModels as any[];
    const model = models?.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const handleOrderClick = (orderId: string) => {
    navigate(`/order-entry?draft=${orderId}`);
  };

  const handlePrint = () => {
    if (!pipelineDetails) return;

    const totalOrders = printDept === 'all'
      ? Object.values(pipelineCounts || {}).reduce((s, c) => s + c, 0)
      : (pipelineCounts?.[printDept] ?? 0);
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    const now = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const reportTitle = printDept === 'all'
      ? 'Production Pipeline — Department View'
      : `Production Pipeline — ${printDept}`;

    const isSingleDept = printDept !== 'all';
    const gridCols = isSingleDept ? '1fr' : 'repeat(3, 1fr)';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} — ${now}</title>
        <style>
          /* ── Force colour printing ── */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }

          @page {
            size: ${isSingleDept ? 'letter portrait' : 'letter landscape'};
            margin: 0.55in 0.5in 0.6in 0.5in;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 10.5px;
            color: #111;
            background: #fff;
          }

          /* ── Header ── */
          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-bottom: 2px solid #111;
            padding-bottom: 6px;
            margin-bottom: 14px;
          }
          .report-header h1 { font-size: 15px; font-weight: 800; letter-spacing: -0.02em; }
          .report-header .meta { font-size: 9px; color: #555; text-align: right; line-height: 1.5; }
          .report-header .meta strong { color: #111; }

          /* ── Dept grid ── */
          .grid {
            display: grid;
            grid-template-columns: ${gridCols};
            gap: 10px;
          }

          /* ── Card ── */
          .card {
            border-radius: 6px;
            border: 1.5px solid #ccc;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .card-header {
            padding: 6px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .card-header .dept-name {
            font-weight: 800;
            font-size: 11px;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .card-header .count {
            background: rgba(255,255,255,0.25);
            border-radius: 99px;
            padding: 1px 7px;
            font-size: 9.5px;
            font-weight: 700;
            color: #fff;
          }
          .card-body { padding: 7px 8px; background: #fff; }

          /* ── Section labels ── */
          .section-label {
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin: 7px 0 3px;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .section-label:first-child { margin-top: 2px; }
          .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
          .green  { color: #15803d; } .dot-green  { background: #16a34a; }
          .orange { color: #c2410c; } .dot-orange { background: #ea580c; }
          .blue   { color: #1d4ed8; } .dot-blue   { background: #2563eb; }
          .gray   { color: #6b7280; } .dot-gray   { background: #9ca3af; }

          /* ── Tables ── */
          table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
          thead tr { background: #f1f5f9 !important; }
          th {
            text-align: left;
            padding: 2px 5px;
            color: #475569;
            font-weight: 700;
            border-bottom: 1px solid #cbd5e1;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          td { padding: 2.5px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
          td.mono { font-family: 'Courier New', monospace; font-weight: 700; }
          tr:last-child td { border-bottom: none; }
          tr:nth-child(even) { background: #f8fafc !important; }

          /* Status colours */
          .status-on       { color: #15803d; font-weight: 600; }
          .status-overdue  { color: #b45309; font-weight: 600; }
          .status-cannot   { color: #c2410c; font-weight: 700; }
          .status-critical { color: #b91c1c; font-weight: 800; }

          .empty { color: #94a3b8; font-style: italic; text-align: center; padding: 8px; font-size: 9.5px; }

          /* ── Footer ── */
          @media print {
            body::after {
              content: 'AG Composites — EPOCH Manufacturing System';
              display: block;
              margin-top: 20px;
              text-align: center;
              font-size: 8px;
              color: #aaa;
              border-top: 1px solid #e5e7eb;
              padding-top: 6px;
            }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>${reportTitle}</h1>
          <div class="meta">
            <strong>${totalOrders} active orders</strong><br/>
            Generated ${now}
          </div>
        </div>
        <div class="grid">${buildPrintContent(printDept)}</div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  const isLoading = countsLoading || detailsLoading;

  const expectedCounts = useMemo(() => {
    if (!pipelineDetails) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const [dept, orders] of Object.entries(pipelineDetails)) {
      if (!PIPELINE_DEPARTMENTS.includes(dept as PipelineDepartment)) continue;
      for (const o of orders) {
        if (o.expectedDepartment) {
          counts[o.expectedDepartment] = (counts[o.expectedDepartment] || 0) + 1;
        }
      }
    }
    return counts;
  }, [pipelineDetails]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Production Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading pipeline data...</div>
        </CardContent>
      </Card>
    );
  }

  const totalOrders = PIPELINE_DEPARTMENTS.reduce((sum, dept) => sum + (pipelineCounts?.[dept] ?? 0), 0);
  const deptCounts = PIPELINE_DEPARTMENTS.map((name) => pipelineCounts?.[name] ?? 0);

  // Build print-friendly HTML for dept view
  const buildPrintTable = (orders: OrderDetail[], showExpected: boolean) => {
    if (orders.length === 0) return '';
    const rows = orders.map((o) => {
      const model = getModelDisplayName(o.modelId);
      const due = formatDue(o.dueDate);
      const stCls = o.scheduleStatus === 'on-schedule' ? 'status-on'
        : o.scheduleStatus === 'dept-overdue' ? 'status-overdue'
        : o.scheduleStatus === 'cannot-meet-due' ? 'status-cannot'
        : 'status-critical';
      const stLabel = statusLabel[o.scheduleStatus]?.label ?? o.scheduleStatus;
      const expCol = showExpected ? `<td>${o.expectedDepartment ?? '—'}</td>` : '';
      return `<tr><td class="mono">${getDisplayOrderId(o)}</td><td>${model}</td>${expCol}<td>${due}</td><td class="${stCls}">${stLabel}</td></tr>`;
    }).join('');
    const expHeader = showExpected ? '<th>Forecast</th>' : '';
    return `<table><thead><tr><th>Order</th><th>Model</th>${expHeader}<th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  const buildPrintContent = (deptFilter: string = 'all') => {
    if (!pipelineDetails) return '';
    const depts = deptFilter === 'all' ? PIPELINE_DEPARTMENTS : PIPELINE_DEPARTMENTS.filter(d => d === deptFilter);
    return depts.map((dept) => {
      const orders = pipelineDetails[dept] ?? [];
      const color = getDeptColor(dept);
      const deptIdx = PIPELINE_DEPARTMENTS.indexOf(dept as PipelineDepartment);
      const inPlace = orders.filter((o) => o.expectedDepartment?.toLowerCase() === dept.toLowerCase());
      const shouldProgress = orders.filter((o) => {
        const expIdx = PIPELINE_DEPARTMENTS.indexOf(o.expectedDepartment as PipelineDepartment);
        return expIdx !== -1 && expIdx > deptIdx;
      });
      const ahead = orders.filter((o) => {
        const expIdx = PIPELINE_DEPARTMENTS.indexOf(o.expectedDepartment as PipelineDepartment);
        return expIdx !== -1 && expIdx < deptIdx;
      });
      const noForecast = orders.filter((o) => !o.expectedDepartment || !PIPELINE_DEPARTMENTS.includes(o.expectedDepartment as PipelineDepartment));

      const inPlaceSection = inPlace.length ? `<div class="section-label green"><span class="dot dot-green"></span>In correct place (${inPlace.length})</div>${buildPrintTable(inPlace, false)}` : '';
      const progressSection = shouldProgress.length ? `<div class="section-label orange"><span class="dot dot-orange"></span>Should be further ahead (${shouldProgress.length})</div>${buildPrintTable(shouldProgress, true)}` : '';
      const aheadSection = ahead.length ? `<div class="section-label blue"><span class="dot dot-blue"></span>Ahead of forecast (${ahead.length})</div>${buildPrintTable(ahead, true)}` : '';
      const noForecastSection = noForecast.length ? `<div class="section-label gray"><span class="dot dot-gray"></span>No forecast (${noForecast.length})</div>${buildPrintTable(noForecast, false)}` : '';
      const emptyMsg = orders.length === 0 ? '<div class="empty">Empty</div>' : '';

      return `<div class="card"><div class="card-header" style="background:${color.hex}"><span class="dept-name">${dept}</span><span class="count">${orders.length} order${orders.length !== 1 ? 's' : ''}</span></div><div class="card-body">${emptyMsg}${inPlaceSection}${progressSection}${aheadSection}${noForecastSection}</div></div>`;
    }).join('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <span>Production Pipeline Overview</span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'pipeline'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <BarChart2 className="h-3 w-3" />
                Pipeline
              </button>
              <button
                onClick={() => setViewMode('department')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  viewMode === 'department'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                By Department
              </button>
            </div>

            {viewMode === 'pipeline' && (
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {(
                  [
                    { mode: 'all',       label: 'Show All' },
                    { mode: 'correct',   label: 'Correct Only' },
                    { mode: 'incorrect', label: 'Incorrect Only' },
                  ] as { mode: FilterMode; label: string }[]
                ).map(({ mode, label }, i) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      i > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''
                    } ${
                      filterMode === mode
                        ? mode === 'incorrect'
                          ? 'bg-orange-600 text-white'
                          : mode === 'correct'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {viewMode === 'department' && (
              <>
                {/* Off-track only toggle */}
                <button
                  onClick={() => setShowOffTrackOnly((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    showOffTrackOnly
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Off Track Only
                </button>

                {/* Department selector + print */}
                <div className="flex items-center gap-1">
                  <select
                    value={printDept}
                    onChange={(e) => setPrintDept(e.target.value)}
                    className="text-xs h-7 rounded-l-md border border-r-0 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="all">All Departments</option>
                    {PIPELINE_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrint}
                    className="text-xs h-7 gap-1.5 rounded-l-none border-l-0"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                </div>
              </>
            )}

            <Badge variant="outline" className="text-sm">
              {totalOrders} Active Orders
            </Badge>
            {ytdShipped !== undefined && (
              <Badge variant="outline" className="text-sm bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200">
                {ytdShipped.count} YTD Shipped ({ytdShipped.year})
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* ── Department View ─────────────────────────────────────── */}
        {viewMode === 'department' && pipelineDetails && (
          <DepartmentView
            pipelineDetails={pipelineDetails}
            getModelDisplayName={getModelDisplayName}
            onOrderClick={handleOrderClick}
            showOffTrackOnly={showOffTrackOnly}
          />
        )}

        {/* ── Pipeline View ───────────────────────────────────────── */}
        {viewMode === 'pipeline' && (
          <>
            {/* Department sort buttons */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">Sort by expected department:</div>
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_DEPARTMENTS.map((dept) => {
                  const color = getDeptColor(dept);
                  const count = expectedCounts[dept] ?? 0;
                  const isActive = focusDept === dept;
                  return (
                    <button
                      key={dept}
                      onClick={() => setFocusDept(isActive ? null : dept)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        isActive
                          ? 'text-white shadow-md scale-105'
                          : 'bg-transparent hover:opacity-80'
                      }`}
                      style={
                        isActive
                          ? { backgroundColor: color.hex, borderColor: color.hex }
                          : { borderColor: color.hex, color: color.hex }
                      }
                    >
                      {dept}
                      {count > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${
                            isActive ? 'bg-white/25 text-white' : 'text-white'
                          }`}
                          style={isActive ? {} : { backgroundColor: color.hex }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Department focus panel */}
            {focusDept && pipelineDetails && (
              <DepartmentFocusPanel
                targetDept={focusDept}
                pipelineDetails={pipelineDetails}
                getModelDisplayName={getModelDisplayName}
                onOrderClick={handleOrderClick}
                onClose={() => setFocusDept(null)}
              />
            )}

            {/* Pipeline row */}
            <div className="overflow-x-auto pb-2 mt-4">
              <div className="flex items-start min-w-max gap-0">
                {PIPELINE_DEPARTMENTS.map((deptName, idx) => {
                  const count = pipelineCounts?.[deptName] ?? 0;
                  const orders = pipelineDetails?.[deptName] ?? [];
                  const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
                  const deptColor = getDeptColor(deptName);

                  const upstreamCount = idx > 0 ? deptCounts[idx - 1] : null;
                  const upstreamName  = idx > 0 ? PIPELINE_DEPARTMENTS[idx - 1] : null;
                  const upstreamPressure =
                    upstreamCount !== null
                      ? calculateFlowPressure(upstreamCount, count)
                      : null;
                  const isHighPressureTarget = upstreamPressure?.pressureLevel === 'HIGH';
                  const isFocused = focusDept === deptName;

                  const correctCount = orders.filter(
                    (o) =>
                      o.expectedDepartment &&
                      o.expectedDepartment.toLowerCase() === deptName.toLowerCase()
                  ).length;
                  const wrongCount = orders.length - correctCount;

                  return (
                    <React.Fragment key={deptName}>
                      {idx > 0 && upstreamCount !== null && upstreamName && (
                        <FlowPressureIndicator
                          upstreamName={upstreamName}
                          downstreamName={deptName}
                          upstreamCount={upstreamCount}
                          downstreamCount={count}
                        />
                      )}

                      <div
                        className={`flex-shrink-0 w-24 text-center space-y-2 rounded-lg p-1 transition-colors ${
                          isFocused
                            ? 'ring-2 ring-offset-1'
                            : isHighPressureTarget
                            ? 'ring-2 ring-red-500 ring-offset-1 bg-red-50 dark:bg-red-950/20'
                            : ''
                        }`}
                        style={isFocused ? { '--tw-ring-color': deptColor.hex } as React.CSSProperties : {}}
                      >
                        <div
                          className={`w-full h-16 rounded-lg flex items-center justify-center font-bold text-xl text-white relative ${
                            count > 45 ? 'ring-2 ring-yellow-400 ring-offset-1' : ''
                          }`}
                          style={{ backgroundColor: deptColor.hex }}
                        >
                          {count}
                          {count > 45 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">!</span>
                          )}
                        </div>

                        <div className="text-xs font-medium leading-tight">{deptName}</div>

                        {wrongCount > 0 && (
                          <div className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                            {wrongCount} wrong dept
                          </div>
                        )}

                        <div className="min-h-[60px] p-2 bg-gray-50 dark:bg-gray-800/50 rounded border overflow-hidden">
                          <DepartmentVisualization
                            department={deptName}
                            orders={orders}
                            getModelDisplayName={getModelDisplayName}
                            onOrderClick={handleOrderClick}
                            filterMode={filterMode}
                          />
                        </div>

                        <Progress value={percentage} className="h-2" />
                        <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>

                        {upstreamPressure && (
                          <div
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded leading-tight ${
                              pressureColors[upstreamPressure.pressureLevel].badge
                            }`}
                          >
                            {upstreamPressure.pressureLevel} pressure
                            <span className="block font-normal opacity-75">
                              ↑ {upstreamCount} upstream
                            </span>
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1.5 text-center">
                  Card color = forecast expected dept. Grey = order is in its correct dept. Colored = order is in wrong dept.
                </div>
                <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-gray-200 border border-gray-400" />
                    <span>Correct dept (grey)</span>
                  </div>
                  {PIPELINE_DEPARTMENTS.map((dept) => {
                    const color = getDeptColor(dept);
                    return (
                      <div key={dept} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: color.hex }} />
                        <span>{dept}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs flex-wrap pt-1 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-yellow-400" />
                  <span>Dept overdue</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-orange-500" />
                  <span>Cannot meet due date</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-red-600" />
                  <span>Critical</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

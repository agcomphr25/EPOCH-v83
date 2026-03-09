import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { PIPELINE_DEPARTMENTS } from '@/constants/pipelineDepartments';
import { calculateFlowPressure, type PressureLevel } from '@/utils/calculateFlowPressure';

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
}

const statusColors: Record<ScheduleStatus, string> = {
  'on-schedule': 'bg-green-500',
  'dept-overdue': 'bg-yellow-500',
  'cannot-meet-due': 'bg-orange-500',
  critical: 'bg-red-500',
};

const pressureColors: Record<PressureLevel, { arrow: string; badge: string; dot: string }> = {
  LOW:    { arrow: 'text-green-500',  badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',  dot: 'bg-green-500'  },
  MEDIUM: { arrow: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
  HIGH:   { arrow: 'text-red-500',    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',    dot: 'bg-red-500'    },
};

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
      {/* Arrow shaft */}
      <div className={`flex flex-col items-center gap-0.5 cursor-default select-none`}>
        <div className={`w-px h-5 ${colors.dot}`} />
        {/* Arrowhead */}
        <svg width="14" height="10" viewBox="0 0 14 10" className="block">
          <polygon
            points="7,10 0,0 14,0"
            className={pressureLevel === 'LOW' ? 'fill-green-500' : pressureLevel === 'MEDIUM' ? 'fill-yellow-500' : 'fill-red-500'}
          />
        </svg>
      </div>

      {/* Pressure dot indicator */}
      <div className={`mt-1 w-2.5 h-2.5 rounded-full ${colors.dot} opacity-80`} />

      {/* Tooltip — floats below the indicator */}
      {hovered && (
        <div className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none">
          {/* Tooltip caret */}
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
const OrderPixel = ({ order, onClick }: { order: OrderDetail; onClick?: () => void }) => {
  const getStatusStyle = (status: ScheduleStatus) => {
    if (status === 'critical')        return { backgroundColor: '#EF4444' };
    if (status === 'cannot-meet-due') return { backgroundColor: '#FFA500' };
    if (status === 'dept-overdue')    return { backgroundColor: '#FFFF00' };
    return {};
  };

  return (
    <div
      className={`w-2 h-2 cursor-pointer hover:scale-150 transition-transform ${
        ['critical', 'cannot-meet-due', 'dept-overdue'].includes(order.scheduleStatus)
          ? ''
          : statusColors[order.scheduleStatus]
      }`}
      style={getStatusStyle(order.scheduleStatus)}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - ${order.scheduleStatus} (${order.daysInDept} days)`}
    />
  );
};

// ── Order chip (low-volume) ───────────────────────────────────────────────────
const OrderChip = ({
  order,
  onClick,
  getModelDisplayName,
}: {
  order: OrderDetail;
  onClick?: () => void;
  getModelDisplayName?: (modelId: string) => string;
}) => {
  const getStatusStyle = (status: ScheduleStatus) => {
    if (status === 'critical')        return { backgroundColor: '#EF4444', color: '#FFFFFF' };
    if (status === 'cannot-meet-due') return { backgroundColor: '#FFA500' };
    if (status === 'dept-overdue')    return { backgroundColor: '#FFFF00', color: '#000000' };
    return {};
  };

  return (
    <div
      className={`px-2 py-1 rounded text-xs cursor-pointer hover:bg-opacity-80 transition-colors ${
        ['critical', 'cannot-meet-due', 'dept-overdue'].includes(order.scheduleStatus)
          ? ''
          : statusColors[order.scheduleStatus] + ' text-white'
      }`}
      style={getStatusStyle(order.scheduleStatus)}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - ${getModelDisplayName ? getModelDisplayName(order.modelId) : order.modelId} - ${order.scheduleStatus} (${order.daysInDept} days)`}
    >
      {getDisplayOrderId(order)}
    </div>
  );
};

// ── Department visualization ──────────────────────────────────────────────────
const DepartmentVisualization = ({
  orders,
  getModelDisplayName,
  onOrderClick,
}: {
  department: string;
  orders: OrderDetail[];
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
}) => {
  const count = orders.length;
  if (count > 20) {
    return (
      <div className="grid grid-cols-10 gap-1">
        {orders.map((order) => (
          <OrderPixel key={order.orderId} order={order} onClick={() => onOrderClick(order.orderId)} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {orders.map((order) => (
        <OrderChip
          key={order.orderId}
          order={order}
          getModelDisplayName={getModelDisplayName}
          onClick={() => onOrderClick(order.orderId)}
        />
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineVisualization() {
  const [, navigate] = useLocation();

  const { data: pipelineCounts, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ['/api/orders/pipeline-counts'],
    refetchInterval: 30000,
  });

  const { data: pipelineDetails, isLoading: detailsLoading } = useQuery<Record<string, OrderDetail[]>>({
    queryKey: ['/api/orders/pipeline-details'],
    refetchInterval: 30000,
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

  const isLoading = countsLoading || detailsLoading;

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

  const totalOrders = Object.values(pipelineCounts || {}).reduce((sum, c) => sum + c, 0);

  // Build per-department count array aligned to PIPELINE_DEPARTMENTS order
  const deptCounts = PIPELINE_DEPARTMENTS.map((name) => pipelineCounts?.[name] ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Production Pipeline Overview
          <Badge variant="outline" className="text-sm">
            {totalOrders} Active Orders
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Pipeline row: departments interleaved with pressure arrows */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start min-w-max gap-0">
            {PIPELINE_DEPARTMENTS.map((deptName, idx) => {
              const count = pipelineCounts?.[deptName] ?? 0;
              const orders = pipelineDetails?.[deptName] ?? [];
              const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
              const isOverloaded = count > 45;

              // Upstream pressure (from previous dept into this one)
              const upstreamCount = idx > 0 ? deptCounts[idx - 1] : null;
              const upstreamName  = idx > 0 ? PIPELINE_DEPARTMENTS[idx - 1] : null;
              const upstreamPressure =
                upstreamCount !== null
                  ? calculateFlowPressure(upstreamCount, count)
                  : null;
              const isHighPressureTarget = upstreamPressure?.pressureLevel === 'HIGH';

              return (
                <React.Fragment key={deptName}>
                  {/* Pressure arrow from previous dept */}
                  {idx > 0 && upstreamCount !== null && upstreamName && (
                    <FlowPressureIndicator
                      upstreamName={upstreamName}
                      downstreamName={deptName}
                      upstreamCount={upstreamCount}
                      downstreamCount={count}
                    />
                  )}

                  {/* Department card */}
                  <div
                    className={`flex-shrink-0 w-24 text-center space-y-2 rounded-lg p-1 transition-colors ${
                      isHighPressureTarget
                        ? 'ring-2 ring-red-500 ring-offset-1 bg-red-50 dark:bg-red-950/20'
                        : ''
                    }`}
                  >
                    {/* Count tile */}
                    <div
                      className={`w-full h-16 rounded-lg flex items-center justify-center font-bold text-xl ${
                        isOverloaded ? 'text-black' : 'bg-[#7BAFD4] text-white'
                      }`}
                      style={isOverloaded ? { backgroundColor: '#FFFF00' } : {}}
                    >
                      {count}
                    </div>

                    {/* Dept name */}
                    <div className="text-xs font-medium leading-tight">{deptName}</div>

                    {/* Order visualization */}
                    <div className="min-h-[60px] p-2 bg-gray-50 dark:bg-gray-800/50 rounded border overflow-hidden">
                      <DepartmentVisualization
                        department={deptName}
                        orders={orders}
                        getModelDisplayName={getModelDisplayName}
                        onOrderClick={handleOrderClick}
                      />
                    </div>

                    <Progress value={percentage} className="h-2" />
                    <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>

                    {/* Upstream pressure badge */}
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
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>On Schedule</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#FFFF00' }} />
              <span>Dept Overdue</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#FFA500' }} />
              <span>Can't Meet Due</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span>Critical</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#FFFF00' }} />
              <span>Card: &gt;45 Stocks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span>Low pressure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span>Medium pressure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>High pressure — bottleneck risk</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

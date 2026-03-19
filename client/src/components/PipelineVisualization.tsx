import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { PIPELINE_DEPARTMENTS, DEPARTMENT_COLORS, type PipelineDepartment } from '@/constants/pipelineDepartments';
import { calculateFlowPressure, type PressureLevel } from '@/utils/calculateFlowPressure';
import { Filter } from 'lucide-react';

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

// ── Department visualization ──────────────────────────────────────────────────
const DepartmentVisualization = ({
  department,
  orders,
  getModelDisplayName,
  onOrderClick,
  showOnlyCorrect,
}: {
  department: string;
  orders: OrderDetail[];
  getModelDisplayName: (modelId: string) => string;
  onOrderClick: (orderId: string) => void;
  showOnlyCorrect: boolean;
}) => {
  const visibleOrders = showOnlyCorrect
    ? orders.filter(
        (o) =>
          o.expectedDepartment &&
          o.expectedDepartment.toLowerCase() === department.toLowerCase()
      )
    : orders;

  const count = visibleOrders.length;

  if (count === 0) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-2">
        {showOnlyCorrect ? 'None in correct dept' : 'No orders'}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineVisualization() {
  const [, navigate] = useLocation();
  const [showOnlyCorrect, setShowOnlyCorrect] = useState(false);

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

  const deptCounts = PIPELINE_DEPARTMENTS.map((name) => pipelineCounts?.[name] ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Production Pipeline Overview
          <div className="flex items-center gap-2">
            <Button
              variant={showOnlyCorrect ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOnlyCorrect((v) => !v)}
              className="text-xs h-7 gap-1"
              title={showOnlyCorrect ? 'Showing only orders in their correct department' : 'Showing all orders'}
            >
              <Filter className="h-3 w-3" />
              {showOnlyCorrect ? 'Correct Dept Only' : 'Show All'}
            </Button>
            <Badge variant="outline" className="text-sm">
              {totalOrders} Active Orders
            </Badge>
          </div>
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
              const deptColor = getDeptColor(deptName);

              const upstreamCount = idx > 0 ? deptCounts[idx - 1] : null;
              const upstreamName  = idx > 0 ? PIPELINE_DEPARTMENTS[idx - 1] : null;
              const upstreamPressure =
                upstreamCount !== null
                  ? calculateFlowPressure(upstreamCount, count)
                  : null;
              const isHighPressureTarget = upstreamPressure?.pressureLevel === 'HIGH';

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
                      isHighPressureTarget
                        ? 'ring-2 ring-red-500 ring-offset-1 bg-red-50 dark:bg-red-950/20'
                        : ''
                    }`}
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
                        showOnlyCorrect={showOnlyCorrect}
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
          {/* Department color legend */}
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

          {/* Schedule status legend */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5 text-center">Schedule Status (border / dot indicator — only on wrong-dept cards)</div>
            <div className="flex items-center justify-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-gray-300" />
                <span>On Schedule (no border)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-yellow-400 bg-gray-200" />
                <span>Dept Overdue</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-orange-500 bg-gray-200" />
                <span>Can't Meet Due</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-red-600 bg-gray-200" />
                <span>Critical</span>
              </div>
            </div>
          </div>

          {/* Pressure + overloaded legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded border-2 border-yellow-400 bg-gray-300" />
              <span>Header ring: &gt;45 Orders</span>
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

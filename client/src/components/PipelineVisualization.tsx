import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getDisplayOrderId } from '@/lib/orderUtils';

const departments = [
  { name: 'Layup/Plugging', color: 'bg-[#7BAFD4]' },
  { name: 'Barcode', color: 'bg-[#7BAFD4]' },
  { name: 'CNC', color: 'bg-[#7BAFD4]' },
  { name: 'Gunsmith', color: 'bg-[#7BAFD4]' },
  { name: 'Finish', color: 'bg-[#7BAFD4]' },
  { name: 'Finish QC', color: 'bg-[#7BAFD4]' },
  { name: 'Paint', color: 'bg-[#7BAFD4]' },
  { name: 'Shipping QC', color: 'bg-[#7BAFD4]' },
  { name: 'Shipping', color: 'bg-[#7BAFD4]' }
];

const productionQueue = { name: 'P1 Production Queue', color: 'bg-[#7BAFD4]' };

type ScheduleStatus = 'on-schedule' | 'dept-overdue' | 'cannot-meet-due' | 'critical';

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
  'critical': 'bg-red-500'
};

// Hybrid visualization components
const OrderPixel = ({ order, onClick }: { order: OrderDetail; onClick?: () => void }) => {
  const getStatusStyle = (status: ScheduleStatus) => {
    if (status === 'cannot-meet-due') {
      return { backgroundColor: '#FFA500' };
    }
    if (status === 'dept-overdue') {
      return { backgroundColor: '#FFFF00' };
    }
    return {};
  };

  return (
    <div 
      className={`w-2 h-2 cursor-pointer hover:scale-150 transition-transform ${
        (order.scheduleStatus === 'cannot-meet-due' || order.scheduleStatus === 'dept-overdue') ? '' : statusColors[order.scheduleStatus]
      }`}
      style={getStatusStyle(order.scheduleStatus)}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - ${order.scheduleStatus} (${order.daysInDept} days)`}
    />
  );
};

const OrderChip = ({ order, onClick, getModelDisplayName }: { order: OrderDetail; onClick?: () => void; getModelDisplayName?: (modelId: string) => string }) => {
  const getStatusStyle = (status: ScheduleStatus) => {
    if (status === 'cannot-meet-due') {
      return { backgroundColor: '#FFA500' };
    }
    if (status === 'dept-overdue') {
      return { backgroundColor: '#FFFF00', color: '#000000' }; // Black text on bright yellow
    }
    return {};
  };

  return (
    <div 
      className={`px-2 py-1 rounded text-xs cursor-pointer hover:bg-opacity-80 transition-colors ${
        (order.scheduleStatus === 'cannot-meet-due' || order.scheduleStatus === 'dept-overdue') ? '' : statusColors[order.scheduleStatus] + ' text-white'
      }`}
      style={getStatusStyle(order.scheduleStatus)}
      onClick={onClick}
      title={`${getDisplayOrderId(order)} - ${getModelDisplayName ? getModelDisplayName(order.modelId) : order.modelId} - ${order.scheduleStatus} (${order.daysInDept} days)`}
    >
      {getDisplayOrderId(order)}
    </div>
  );
};

const DepartmentVisualization = ({ department, orders, getModelDisplayName }: { department: string; orders: OrderDetail[]; getModelDisplayName: (modelId: string) => string }) => {
  const count = orders.length;
  const usePixels = count > 20; // Hybrid selection threshold
  
  // Use wider grid for Production Queue
  const isProductionQueue = department === 'P1 Production Queue';
  const gridCols = isProductionQueue ? 'grid-cols-16' : 'grid-cols-10';

  if (usePixels) {
    // Pixel grid for high volume departments
    return (
      <div className="space-y-2">
        <div className={`grid ${gridCols} gap-1`}>
          {orders.map((order, index) => (
            <OrderPixel key={order.orderId} order={order} />
          ))}
        </div>
      </div>
    );
  } else {
    // Chips for low volume departments
    return (
      <div className="flex flex-wrap gap-1">
        {orders.map((order) => (
          <OrderChip key={order.orderId} order={order} getModelDisplayName={getModelDisplayName} />
        ))}
      </div>
    );
  }
};

export default function PipelineVisualization() {
  const { data: pipelineCounts, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ['/api/orders/pipeline-counts'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: pipelineDetails, isLoading: detailsLoading } = useQuery<Record<string, OrderDetail[]>>({
    queryKey: ['/api/orders/pipeline-details'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    const models = stockModels as any[];
    const model = models?.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const isLoading = countsLoading || detailsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Production Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading pipeline data...</div>
        </CardContent>
      </Card>
    );
  }

  const totalOrders = Object.values(pipelineCounts || {}).reduce((sum, count) => sum + count, 0);

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
        {/* Main departments in a 3x3 grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-6">
          {departments.map((dept) => {
            // Get count and orders for this department
            const count = pipelineCounts?.[dept.name] || 0;
            const orders = pipelineDetails?.[dept.name] || [];
            
            const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
            
            // Determine if department should be highlighted (more than 45 stocks)
            const isOverloaded = count > 45;
            
            return (
              <div key={dept.name} className="text-center space-y-2">
                <div 
                  className={`w-full h-16 rounded-lg flex items-center justify-center font-bold text-xl ${
                    isOverloaded ? 'text-black' : `${dept.color} text-white`
                  }`}
                  style={isOverloaded ? { backgroundColor: '#FFFF00' } : {}}
                >
                  {count}
                </div>
                <div className="text-sm font-medium">{dept.name}</div>
                
                {/* Schedule status visualization */}
                <div className="min-h-[60px] p-2 bg-gray-50 rounded border overflow-hidden">
                  <DepartmentVisualization department={dept.name} orders={orders} getModelDisplayName={getModelDisplayName} />
                </div>
                
                <Progress value={percentage} className="h-2" />
                <div className="text-xs text-gray-500">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Production Queue at the bottom - wider format */}
        {(() => {
          const count = pipelineCounts?.[productionQueue.name] || 0;
          const orders = pipelineDetails?.[productionQueue.name] || [];
          const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
          const isOverloaded = count > 45;
          
          return (
            <div className="border-t pt-4">
              <div className="text-center space-y-2">
                <div 
                  className={`w-full h-16 rounded-lg flex items-center justify-center font-bold text-xl ${
                    isOverloaded ? 'text-black' : `${productionQueue.color} text-white`
                  }`}
                  style={isOverloaded ? { backgroundColor: '#FFFF00' } : {}}
                >
                  {count}
                </div>
                <div className="text-sm font-medium">{productionQueue.name}</div>
                
                {/* Schedule status visualization - wider for more orders */}
                <div className="min-h-[100px] p-4 bg-gray-50 rounded border overflow-hidden">
                  <DepartmentVisualization department={productionQueue.name} orders={orders} getModelDisplayName={getModelDisplayName} />
                </div>
                
                <Progress value={percentage} className="h-2" />
                <div className="text-xs text-gray-500">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })()}
        
        {/* Legend */}
        <div className="mt-4 space-y-2">
          {/* Order Status Legend */}
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>On Schedule</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{backgroundColor: '#FFFF00'}}></div>
              <span>Dept Overdue</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{backgroundColor: '#FFA500'}}></div>
              <span>Can't Meet Due</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Critical</span>
            </div>
          </div>
          
          {/* Department Card Legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{backgroundColor: '#FFFF00'}}></div>
              <span>Department Card: {'>'}45 Stocks</span>
            </div>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Pipeline Flow Direction:</span>
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-xs">{productionQueue.name}</span>
              <span>→</span>
              {departments.map((dept, index) => (
                <React.Fragment key={dept.name}>
                  <span className="text-xs">{dept.name}</span>
                  {index < departments.length - 1 && <span>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const departments = [
  { name: 'Layup', color: 'bg-[#7BAFD4]' },
  { name: 'Plugging', color: 'bg-[#7BAFD4]' },
  { name: 'CNC', color: 'bg-[#7BAFD4]' },
  { name: 'Finish', color: 'bg-[#7BAFD4]' },
  { name: 'Gunsmith', color: 'bg-[#7BAFD4]' },
  { name: 'Paint', color: 'bg-[#7BAFD4]' },
  { name: 'QC', color: 'bg-[#7BAFD4]' },
  { name: 'Shipping', color: 'bg-[#7BAFD4]' }
];

type ScheduleStatus = 'on-schedule' | 'at-risk' | 'behind';

interface OrderDetail {
  orderId: string;
  modelId: string;
  dueDate: Date;
  daysInDept: number;
  scheduleStatus: ScheduleStatus;
}

const statusColors = {
  'on-schedule': 'bg-green-500',
  'at-risk': 'bg-yellow-500',
  'behind': 'bg-red-500'
};

// Hybrid visualization components
const OrderPixel = ({ order, onClick }: { order: OrderDetail; onClick?: () => void }) => (
  <div 
    className={`w-2 h-2 ${statusColors[order.scheduleStatus]} cursor-pointer hover:scale-150 transition-transform`}
    onClick={onClick}
    title={`${order.orderId} - ${order.scheduleStatus} (${order.daysInDept} days)`}
  />
);

const OrderChip = ({ order, onClick }: { order: OrderDetail; onClick?: () => void }) => (
  <div 
    className={`px-2 py-1 rounded text-xs text-white ${statusColors[order.scheduleStatus]} cursor-pointer hover:bg-opacity-80 transition-colors`}
    onClick={onClick}
    title={`${order.modelId} - ${order.scheduleStatus} (${order.daysInDept} days)`}
  >
    {order.orderId}
  </div>
);

const DepartmentVisualization = ({ department, orders }: { department: string; orders: OrderDetail[] }) => {
  const count = orders.length;
  const usePixels = count > 20; // Hybrid selection threshold

  if (usePixels) {
    // Pixel grid for high volume departments
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-10 gap-1">
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
          <OrderChip key={order.orderId} order={order} />
        ))}
      </div>
    );
  }
};

export default function PipelineVisualization() {
  const { data: pipelineCounts, isLoading: countsLoading } = useQuery({
    queryKey: ['/api/orders/pipeline-counts'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: pipelineDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['/api/orders/pipeline-details'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {departments.map((dept) => {
            const count = pipelineCounts?.[dept.name] || 0;
            const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
            const orders = pipelineDetails?.[dept.name] || [];
            
            return (
              <div key={dept.name} className="text-center space-y-2">
                <div className={`w-full h-16 ${dept.color} rounded-lg flex items-center justify-center text-white font-bold text-xl`}>
                  {count}
                </div>
                <div className="text-sm font-medium">{dept.name}</div>
                
                {/* Schedule status visualization */}
                <div className="min-h-[60px] p-2 bg-gray-50 rounded border overflow-hidden">
                  <DepartmentVisualization department={dept.name} orders={orders} />
                </div>
                
                <Progress value={percentage} className="h-2" />
                <div className="text-xs text-gray-500">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>On Schedule</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>At Risk</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Behind</span>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Pipeline Flow Direction:</span>
            <div className="flex items-center space-x-2">
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
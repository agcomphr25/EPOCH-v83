import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { createLayupSchedulerService, ScheduledOrder } from '../../../shared/services/LayupSchedulerService';
import { createOrderPriorityService, PriorityOrder } from '../../../shared/services/OrderPriorityService';
import { Order } from '../../../shared/schema';

// Sample data for demonstration
const sampleOrders: Order[] = [
  {
    id: 1,
    orderId: 'ORD-001',
    customer: 'Mesa Tactical',
    product: 'Mesa Universal Stock',
    quantity: 1,
    status: 'FINALIZED',
    date: new Date(),
    orderDate: new Date(),
    currentDepartment: 'P1 Production Queue',
    stockModelId: 'mesa-universal-12ga',
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    customerId: 'CUST-001',
    poId: null,
    isOnSchedule: true,
    priorityScore: 10,
    rushTier: 'EXPEDITE',
    itemId: 'ITEM-001',
    notes: 'High priority Mesa Universal order',
    shippedAt: null,
    layupCompletedAt: null,
    pluggingCompletedAt: null,
    cncCompletedAt: null,
    finishCompletedAt: null,
    gunsmithCompletedAt: null,
    paintCompletedAt: null,
    qcCompletedAt: null,
    shippingCompletedAt: null,
    scrapDate: null,
    scrapReason: null,
    scrapDisposition: null,
    scrapAuthorization: null,
    isReplacement: false,
    replacedOrderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    orderId: 'PO-002',
    customer: 'Production Customer',
    product: 'Standard Stock',
    quantity: 1,
    status: 'FINALIZED',
    date: new Date(),
    orderDate: new Date(),
    currentDepartment: 'P1 Production Queue',
    stockModelId: 'standard-stock-12ga',
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    customerId: 'CUST-002',
    poId: 123,
    isOnSchedule: true,
    priorityScore: 30,
    rushTier: 'STANDARD',
    itemId: 'ITEM-002',
    notes: 'Production order',
    shippedAt: null,
    layupCompletedAt: null,
    pluggingCompletedAt: null,
    cncCompletedAt: null,
    finishCompletedAt: null,
    gunsmithCompletedAt: null,
    paintCompletedAt: null,
    qcCompletedAt: null,
    shippingCompletedAt: null,
    scrapDate: null,
    scrapReason: null,
    scrapDisposition: null,
    scrapAuthorization: null,
    isReplacement: false,
    replacedOrderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    orderId: 'ORD-003',
    customer: 'Regular Customer',
    product: 'Custom Stock',
    quantity: 1,
    status: 'FINALIZED',
    date: new Date(),
    orderDate: new Date(),
    currentDepartment: 'P1 Production Queue',
    stockModelId: 'custom-stock-20ga',
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    customerId: 'CUST-003',
    poId: null,
    isOnSchedule: true,
    priorityScore: 55,
    rushTier: 'STANDARD',
    itemId: 'ITEM-003',
    notes: 'Regular customer order',
    shippedAt: null,
    layupCompletedAt: null,
    pluggingCompletedAt: null,
    cncCompletedAt: null,
    finishCompletedAt: null,
    gunsmithCompletedAt: null,
    paintCompletedAt: null,
    qcCompletedAt: null,
    shippingCompletedAt: null,
    scrapDate: null,
    scrapReason: null,
    scrapDisposition: null,
    scrapAuthorization: null,
    isReplacement: false,
    replacedOrderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const sampleMoldCapacities = [
  {
    moldId: 'mold-12ga-universal',
    dailyCapacity: 4,
    compatibleStockModels: ['mesa-universal-12ga', 'standard-stock-12ga'],
  },
  {
    moldId: 'mold-20ga-custom',
    dailyCapacity: 3,
    compatibleStockModels: ['custom-stock-20ga'],
  },
];

const sampleEmployeeCapacities = [
  {
    employeeId: 'emp-001',
    dailyHours: 8,
    availableDays: [1, 2, 3, 4], // Mon-Thu
  },
  {
    employeeId: 'emp-002',
    dailyHours: 8,
    availableDays: [1, 2, 3, 4, 5], // Mon-Fri
  },
];

const SimplifiedLayupScheduler: React.FC = () => {
  const [prioritizedOrders, setPrioritizedOrders] = useState<PriorityOrder[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<ScheduledOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Initialize services
  const priorityService = createOrderPriorityService();
  const schedulerService = createLayupSchedulerService(priorityService);

  useEffect(() => {
    generateSchedule();
  }, []);

  const generateSchedule = () => {
    setLoading(true);
    
    try {
      // Step 1: Use the priority service to sort orders
      const sorted = priorityService.sortOrdersByPriority(sampleOrders);
      setPrioritizedOrders(sorted);

      // Step 2: Use the scheduler service to create the schedule
      const scheduled = schedulerService.generateSchedule(
        sampleOrders,
        sampleMoldCapacities,
        sampleEmployeeCapacities
      );
      setScheduledOrders(scheduled);
    } catch (error) {
      console.error('Error generating schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadgeColor = (orderType: PriorityOrder['orderType'], urgency: PriorityOrder['urgencyLevel']) => {
    if (orderType === 'mesa_universal') return 'bg-red-500 text-white';
    if (urgency === 'critical') return 'bg-orange-500 text-white';
    if (urgency === 'high') return 'bg-yellow-500 text-black';
    if (orderType === 'production_order') return 'bg-blue-500 text-white';
    if (orderType === 'po_order') return 'bg-purple-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const getUrgencyIcon = (urgency: PriorityOrder['urgencyLevel']) => {
    switch (urgency) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4" />;
      case 'high':
        return <Clock className="w-4 h-4" />;
      case 'medium':
        return <Calendar className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  const getDayName = (dayNumber: number) => {
    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days[dayNumber] || 'Unknown';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Simplified Layup Scheduler</h1>
        <Button onClick={generateSchedule} disabled={loading}>
          {loading ? 'Generating...' : 'Regenerate Schedule'}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Prioritized Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Prioritized Orders (Priority Service)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {prioritizedOrders.map((order, index) => (
                <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <div>
                      <div className="font-medium">{order.orderId}</div>
                      <div className="text-sm text-gray-600">{order.customer}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getUrgencyIcon(order.urgencyLevel)}
                    <Badge className={getPriorityBadgeColor(order.orderType, order.urgencyLevel)}>
                      Score: {order.priorityScore}
                    </Badge>
                    <div className="text-xs text-gray-500 max-w-32 truncate">
                      {order.priorityReason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Orders (Scheduler Service)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledOrders.map((order) => (
                <div key={order.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{order.orderId}</div>
                    <Badge variant="outline">
                      {getDayName(order.scheduledDay)}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Customer: {order.customer}</div>
                    <div>Mold: {order.moldAssignment}</div>
                    <div>Employee: {order.employeeAssignment}</div>
                    <div>Estimated Hours: {order.estimatedHours}</div>
                    <div>Week: {order.scheduledWeek}</div>
                  </div>
                  <Badge className={getPriorityBadgeColor(order.orderType, order.urgencyLevel)}>
                    {order.orderType.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Architecture Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">Separated Concerns</h4>
              <ul className="text-green-700 space-y-1">
                <li>• Priority logic isolated</li>
                <li>• Easy to test independently</li>
                <li>• Clear responsibility boundaries</li>
              </ul>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Maintainable Rules</h4>
              <ul className="text-blue-700 space-y-1">
                <li>• PO vs regular order rules</li>
                <li>• Configurable priority scoring</li>
                <li>• Easy to modify logic</li>
              </ul>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <h4 className="font-medium text-purple-800 mb-2">Clean Interface</h4>
              <ul className="text-purple-700 space-y-1">
                <li>• UI focuses on display only</li>
                <li>• Services handle business logic</li>
                <li>• Better debugging experience</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimplifiedLayupScheduler;
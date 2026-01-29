import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Package,
  Loader2,
} from 'lucide-react';
import { Link } from 'wouter';
import { getDisplayOrderId } from '@/lib/orderUtils';

interface OrderItem {
  id: number;
  orderId: string;
  dueDate: string;
  customerName: string;
  currentDepartment: string;
  status: string;
  orderSource: string;
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  orders: OrderItem[];
  regularOrderCount: number;
  poOrderCount: number;
}

interface CapacityData {
  weeks: WeekData[];
  totalOrders: number;
}

const CAPACITY_THRESHOLD = 30;

export default function DueDateCapacityReport() {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<CapacityData>({
    queryKey: ['/api/reports/due-date-capacity'],
  });

  const toggleWeek = (weekStart: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  };

  const isOverCapacity = (regularOrderCount: number) => regularOrderCount >= CAPACITY_THRESHOLD;

  const getWeekStatus = (week: WeekData) => {
    const today = new Date();
    const weekStart = new Date(week.weekStart);
    const weekEnd = new Date(week.weekEnd);
    
    if (today > weekEnd) {
      return 'past';
    } else if (today >= weekStart && today <= weekEnd) {
      return 'current';
    }
    return 'future';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading capacity data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-700">Error loading report: {(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weeks = data?.weeks || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Due Date Capacity Report
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Orders in FINALIZED and IN_PROGRESS status grouped by due date week
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {data?.totalOrders || 0}
          </div>
          <div className="text-sm text-gray-500">Total Orders</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 border-2 border-red-400" />
          <span className="text-gray-600 dark:text-gray-400">30+ regular orders (high capacity)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-100 border-2 border-blue-300" />
          <span className="text-gray-600 dark:text-gray-400">Current week</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300" />
          <span className="text-gray-600 dark:text-gray-400">Past week</span>
        </div>
      </div>

      {weeks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No orders with FINALIZED or IN_PROGRESS status found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {weeks.map((week) => {
            const isExpanded = expandedWeeks.has(week.weekStart);
            const overCapacity = isOverCapacity(week.regularOrderCount);
            const weekStatus = getWeekStatus(week);
            
            let cardClass = 'border-2 transition-all ';
            if (overCapacity) {
              cardClass += 'border-red-400 bg-red-50 dark:bg-red-950';
            } else if (weekStatus === 'current') {
              cardClass += 'border-blue-300 bg-blue-50 dark:bg-blue-950';
            } else if (weekStatus === 'past') {
              cardClass += 'border-gray-200 bg-gray-50 dark:bg-gray-900 opacity-60';
            } else {
              cardClass += 'border-gray-200 hover:border-gray-300';
            }

            return (
              <Card key={week.weekStart} className={cardClass}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleWeek(week.weekStart)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                          <div>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              {week.weekLabel}
                              {weekStatus === 'current' && (
                                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                                  Current Week
                                </Badge>
                              )}
                              {weekStatus === 'past' && (
                                <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
                                  Past
                                </Badge>
                              )}
                            </CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {overCapacity && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertTriangle className="w-5 h-5" />
                              <span className="font-medium">High Capacity</span>
                            </div>
                          )}
                          <div className="text-right">
                            <div className="flex items-center gap-3">
                              <div>
                                <span className={`text-2xl font-bold ${overCapacity ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                                  {week.regularOrderCount}
                                </span>
                                <span className="text-sm text-gray-500 ml-1">regular</span>
                              </div>
                              {week.poOrderCount > 0 && (
                                <div className="text-gray-400">
                                  <span className="text-lg font-medium text-gray-600">
                                    +{week.poOrderCount}
                                  </span>
                                  <span className="text-sm text-gray-500 ml-1">PO</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[150px]">Order #</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Current Department</TableHead>
                            <TableHead className="w-[120px]">Due Date</TableHead>
                            <TableHead className="w-[100px]">Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {week.orders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell>
                                <Link href={`/orders/${order.id}`}>
                                  <Button variant="link" className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800">
                                    {getDisplayOrderId({ orderId: order.orderId })}
                                  </Button>
                                </Link>
                              </TableCell>
                              <TableCell className="font-medium">
                                {order.customerName}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-normal">
                                  {order.currentDepartment}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-gray-600">
                                {new Date(order.dueDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </TableCell>
                              <TableCell>
                                {order.orderSource === 'PO_RELEASE' ? (
                                  <Badge variant="secondary" className="text-xs">PO</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">Regular</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

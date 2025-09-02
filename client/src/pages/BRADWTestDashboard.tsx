import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench, FileText, Users, ArrowRight, Clock, Package, Settings, Brush, HardHat, Palette, CheckCircle, Truck } from 'lucide-react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

export default function BRADWTestDashboard() {
  // Fetch order data for pipeline overview
  const { data: orders = [] } = useQuery({
    queryKey: ['/api/orders/with-payment-status'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Count orders by department
  const ordersByDepartment = orders.reduce((acc: Record<string, number>, order: any) => {
    if (order.status !== 'FULFILLED' && order.status !== 'SCRAPPED') {
      const dept = order.currentDepartment || 'Unknown';
      acc[dept] = (acc[dept] || 0) + 1;
    }
    return acc;
  }, {});

  const pipelineSteps = [
    { 
      name: 'P1 Production Queue', 
      icon: Clock, 
      color: 'bg-purple-500', 
      textColor: 'text-purple-600',
      route: '/department-queue/production-queue'
    },
    { 
      name: 'Layup/Plugging', 
      icon: Package, 
      color: 'bg-blue-500', 
      textColor: 'text-blue-600',
      route: '/department-queue/layup-plugging'
    },
    { 
      name: 'Barcode', 
      icon: Package, 
      color: 'bg-green-500', 
      textColor: 'text-green-600',
      route: '/department-queue/barcode'
    },
    { 
      name: 'CNC', 
      icon: Settings, 
      color: 'bg-yellow-500', 
      textColor: 'text-yellow-600',
      route: '/department-queue/cnc'
    },
    { 
      name: 'Finish', 
      icon: Brush, 
      color: 'bg-indigo-500', 
      textColor: 'text-indigo-600',
      route: '/department-queue/finish'
    },
    { 
      name: 'Gunsmith', 
      icon: Wrench, 
      color: 'bg-red-500', 
      textColor: 'text-red-600',
      route: '/department-queue/gunsmith'
    },
    { 
      name: 'Paint', 
      icon: Palette, 
      color: 'bg-pink-500', 
      textColor: 'text-pink-600',
      route: '/department-queue/paint'
    },
    { 
      name: 'Shipping QC', 
      icon: CheckCircle, 
      color: 'bg-orange-500', 
      textColor: 'text-orange-600',
      route: '/department-queue/qc-shipping'
    },
    { 
      name: 'Shipping', 
      icon: Truck, 
      color: 'bg-gray-500', 
      textColor: 'text-gray-600',
      route: '/department-queue/shipping'
    }
  ];

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">BRADW Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gunsmith Queue, Orders & Employee Management
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Link href="/department-queue/gunsmith">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-4 text-center">
              <Wrench className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gunsmith Queue</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Gunsmith department orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/all-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Orders</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">View all orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/employee">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Employee Portal</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Employee dashboard (placeholder)</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Production Pipeline Overview */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <HardHat className="w-6 h-6 mr-2 text-blue-600" />
              Production Pipeline Overview
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-400">
              Current order distribution across all production departments
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9 gap-4">
              {pipelineSteps.map((step, index) => {
                const Icon = step.icon;
                const orderCount = ordersByDepartment[step.name] || 0;
                
                return (
                  <div key={step.name} className="relative">
                    <Link href={step.route}>
                      <Card className={`hover:shadow-md transition-all cursor-pointer border-2 hover:border-opacity-50 ${step.textColor.replace('text-', 'hover:border-')}`}>
                        <CardContent className="p-3 text-center">
                          <Icon className={`w-6 h-6 mx-auto mb-2 ${step.textColor}`} />
                          <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {step.name}
                          </h4>
                          <div className={`text-lg font-bold ${step.textColor}`}>
                            {orderCount}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            orders
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                    
                    {/* Arrow between steps (except for last step) */}
                    {index < pipelineSteps.length - 1 && (
                      <div className="hidden xl:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Summary Stats */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {orders.filter((order: any) => order.status === 'FINALIZED' && order.status !== 'FULFILLED' && order.status !== 'SCRAPPED').length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Active Orders</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {orders.filter((order: any) => order.status === 'FULFILLED').length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Completed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {orders.filter((order: any) => order.status === 'SCRAPPED').length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Scrapped</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {orders.length}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Orders</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
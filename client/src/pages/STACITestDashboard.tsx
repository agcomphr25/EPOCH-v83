import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Factory, PlusCircle, FileText, Users, Settings, Wrench } from 'lucide-react';
import { Link } from 'wouter';
import LayupScheduler from '@/components/LayupScheduler';

export default function STACITestDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">STACITEST Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Layup Scheduling & P2 Layup Scheduler Management
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <Link href="/order-entry">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-4 text-center">
              <PlusCircle className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Order Entry</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create new orders</p>
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

        <Link href="/draft-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-yellow-200">
            <CardContent className="p-4 text-center">
              <Settings className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft Orders</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage drafts</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/department-queue/layup-plugging">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
            <CardContent className="p-4 text-center">
              <Wrench className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Layup/Plugging</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Production queue</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customer-management">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Customers</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage customers</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Left Column - Layup Scheduler */}
        <div className="xl:col-span-1">
          <LayupScheduler />
        </div>

        {/* Right Column - P2 Layup Scheduler Placeholder */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-purple-100">
                <Factory className="w-5 h-5 text-purple-600" />
              </div>
              <span>P2 Layup Scheduler</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                P2 Layup Scheduler
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section will display the P2 layup scheduling interface, 
                allowing scheduling and assignment of P2 production orders to molds and dates.
              </p>
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Coming Soon: P2 Layup Scheduling
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Footer Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">📅</div>
            <div className="text-sm font-medium">P1 Layup Scheduler</div>
            <div className="text-xs text-gray-500">Active scheduling & assignment</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">🏭</div>
            <div className="text-sm font-medium">P2 Layup Scheduler</div>
            <div className="text-xs text-gray-500">Scheduler interface ready</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
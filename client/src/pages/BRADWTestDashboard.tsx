import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench, FileText, Users } from 'lucide-react';
import { Link } from 'wouter';

export default function BRADWTestDashboard() {
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
    </div>
  );
}
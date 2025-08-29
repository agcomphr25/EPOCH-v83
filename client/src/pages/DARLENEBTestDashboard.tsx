import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, FileText, FilePenLine, XCircle, Users, User, Factory } from 'lucide-react';
import { Link } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';

export default function DARLENEBTestDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">DARLENEB Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Order Management & Customer Relations
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
              <FilePenLine className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft Orders</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage drafts</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/cancelled-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200">
            <CardContent className="p-4 text-center">
              <XCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cancelled Orders</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">View cancelled orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customer-management">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Customer Management</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage customers</p>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed border-2 border-gray-200">
          <CardContent className="p-4 text-center">
            <User className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-500">Employee Portal</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Placeholder - Coming Soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Production Pipeline Overview */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100">
                <Factory className="w-5 h-5 text-blue-600" />
              </div>
              <span>Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PipelineVisualization />
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
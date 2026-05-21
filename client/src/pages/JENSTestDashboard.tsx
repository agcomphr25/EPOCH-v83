import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Shield,
  FileText,
  ScanBarcode,
  Factory,
  GraduationCap,
  Package,
} from 'lucide-react';
import { Link } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

export default function JENSTestDashboard() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });
  const { data: resolvedEmployee } = useQuery<{ employeeId: number | null }>({
    queryKey: ['/api/timekeeping/my-employee-id'],
    enabled: !!currentUser && !currentUser.employeeId,
  });
  const dashboardEmployeeId = currentUser?.employeeId ?? resolvedEmployee?.employeeId ?? null;

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            JENS Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Quality Control & Production Management
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Link href="/department-queue/finish-qc">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-4 text-center">
              <Shield className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Finish QC Queue
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Quality control queue
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/all-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                All Orders
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                View all orders
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/barcode-scanner">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
            <CardContent className="p-4 text-center">
              <ScanBarcode className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Barcode Scanner
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Scan order barcodes
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/training">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-teal-200">
            <CardContent className="p-4 text-center">
              <GraduationCap className="w-8 h-8 text-teal-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Training Modules
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Complete training courses
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventory/parts-request">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-4 text-center">
              <Package className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Request Parts
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Submit parts requests
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* My Tasks Control Center */}
      {dashboardEmployeeId && (
        <MyTasksControlCenter
          employeeId={dashboardEmployeeId}
          userName={currentUser?.username ?? 'jens'}
          compact={false}
        />
      )}

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

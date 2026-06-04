import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Users, GraduationCap } from 'lucide-react';
import { Link } from 'wouter';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

export default function BRIANDashboard() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            BRIAN Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Welcome, Brian
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/employee-portal">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-6 text-center">
              <Users className="w-10 h-10 text-blue-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Employee Portal
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Access your employee resources
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/training-control-center?tab=modules">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-emerald-200">
            <CardContent className="p-6 text-center">
              <GraduationCap className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Training Modules
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Complete your training courses
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {dashboardEmployeeId && (
        <MyTasksControlCenter
          employeeId={dashboardEmployeeId}
          userName={currentUser?.username ?? 'brian'}
          compact={false}
        />
      )}
    </div>
  );
}

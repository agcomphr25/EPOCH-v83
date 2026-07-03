import { Factory } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DashboardGrid from '@/components/widgets/DashboardGrid';
import DashboardControlBar from '@/components/widgets/DashboardControlBar';
import ControlTowerRibbon from '@/components/widgets/ControlTowerRibbon';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';
import { PCC_DASHBOARD_LAYOUT } from '@/config/pccDashboardLayout';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { apiRequest } from '@/lib/queryClient';

type CurrentUser = {
  id: number;
  username: string;
  role: string;
  employeeId?: number | null;
};

export default function ProductionControlCenter() {
  const { data: currentUser } = useQuery<CurrentUser | null>({
    queryKey: ['currentUser'],
    queryFn: () => apiRequest('/api/auth/session'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const { data: resolvedEmployee } = useQuery<{ employeeId: number | null }>({
    queryKey: ['/api/timekeeping/my-employee-id'],
    queryFn: () => apiRequest('/api/timekeeping/my-employee-id'),
    enabled: !!currentUser && !currentUser.employeeId,
  });
  const dashboardEmployeeId = currentUser?.employeeId ?? resolvedEmployee?.employeeId ?? null;

  return (
    <DashboardFilterProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Production Control Center
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Real-time production monitoring and operational awareness
              </p>
            </div>
          </div>

          <div className="mb-6">
            <DashboardControlBar />
          </div>

          <ControlTowerRibbon />

          {dashboardEmployeeId && (
            <div className="mb-6">
              <MyTasksControlCenter
                employeeId={dashboardEmployeeId}
                userName={currentUser?.username ?? 'tandym'}
                compact={false}
              />
            </div>
          )}

          <DashboardGrid layout={PCC_DASHBOARD_LAYOUT} />
        </div>
      </div>
    </DashboardFilterProvider>
  );
}

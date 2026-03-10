import { Factory } from 'lucide-react';
import DashboardGrid from '@/components/widgets/DashboardGrid';
import { PCC_DASHBOARD_LAYOUT } from '@/config/pccDashboardLayout';

export default function ProductionControlCenter() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
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

        <DashboardGrid layout={PCC_DASHBOARD_LAYOUT} />
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import DashboardGrid from '@/components/widgets/DashboardGrid';
import { PCC_LAYOUT } from '@/config/pccLayout';

export default function ProductionCommandCenter() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Production Command Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live operational metrics for production management
            </p>
          </div>
        </div>
        {currentUser && (
          <div className="text-xs text-muted-foreground text-right">
            <div className="font-medium">{currentUser.username.toUpperCase()}</div>
            <div>EPOCH v8 Manufacturing ERP</div>
          </div>
        )}
      </div>

      <DashboardGrid layout={PCC_LAYOUT} />
    </div>
  );
}

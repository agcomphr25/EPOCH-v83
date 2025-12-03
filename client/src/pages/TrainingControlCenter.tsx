import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { 
  GraduationCap, 
  LayoutGrid, 
  Settings, 
  FileSpreadsheet,
  Users,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';

import Training from './Training';
import TrainingMatrixView from './TrainingMatrixView';
import TrainingManagement from './TrainingManagement';
import TrainingMatrixImport from './TrainingMatrixImport';
import TrainingMatrixManage from './TrainingMatrixManage';

interface TrainingStats {
  totalModules: number;
  activeEmployees: number;
  completedThisMonth: number;
  pendingAssignments: number;
  overdueCount: number;
}

export default function TrainingControlCenter() {
  const [activeTab, setActiveTab] = useState('modules');

  const { data: stats } = useQuery<TrainingStats>({
    queryKey: ['/api/training/stats'],
    refetchInterval: 60000,
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <GraduationCap className="h-8 w-8 text-primary" />
            Training Control Center
          </h1>
          <p className="text-muted-foreground">
            Unified training management: modules, matrix, and assignments
          </p>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border-none">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.totalModules || 0) > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Modules</div>
                  <div className="text-xs text-muted-foreground">{stats?.totalModules || 0} available</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.activeEmployees || 0) > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Employees</div>
                  <div className="text-xs text-muted-foreground">{stats?.activeEmployees || 0} active</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.completedThisMonth || 0) > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Completed</div>
                  <div className="text-xs text-muted-foreground">{stats?.completedThisMonth || 0} this month</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.overdueCount || 0) > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Overdue</div>
                  <div className="text-xs text-muted-foreground">{stats?.overdueCount || 0} items</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="modules" className="flex items-center gap-2" data-testid="tab-modules">
            <GraduationCap className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2" data-testid="tab-matrix">
            <LayoutGrid className="h-4 w-4" />
            Matrix
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2" data-testid="tab-assignments">
            <Users className="h-4 w-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2" data-testid="tab-import">
            <FileSpreadsheet className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2" data-testid="tab-management">
            <Settings className="h-4 w-4" />
            Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          <Training />
        </TabsContent>

        <TabsContent value="matrix" className="space-y-4">
          <TrainingMatrixView />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <TrainingMatrixManage />
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <TrainingMatrixImport />
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <TrainingManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

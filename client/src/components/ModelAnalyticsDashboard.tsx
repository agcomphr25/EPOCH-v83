import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Layers,
  BarChart3,
  Factory,
  Clock,
} from 'lucide-react';
import HistoricalDataUpload from './HistoricalDataUpload';

interface ModelAnalytics {
  modelId: string;
  modelName: string;
  displayName: string;
  isAdjustable: boolean;
  totalInPipeline: number;
  moldCapacity: number;
  queueToCapacityRatio: number;
  healthGrade: 'excellent' | 'good' | 'warning' | 'critical';
  departmentBreakdown: Record<string, {
    count: number;
    onSchedule: number;
    deptOverdue: number;
    cannotMeetDue: number;
    critical: number;
  }>;
  latePercentage: number;
  avgDaysInPipeline: number | null;
}

interface AnalyticsResponse {
  models: ModelAnalytics[];
  summary: {
    totalModels: number;
    totalInPipeline: number;
    criticalModels: number;
    warningModels: number;
  };
  moldCapacity: Record<string, number>;
}

interface DepartmentBreakdownResponse {
  breakdown: Record<string, Record<string, number>>;
  departments: string[];
}

const healthGradeConfig = {
  excellent: {
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgLight: 'bg-green-50',
    icon: CheckCircle,
    label: 'Excellent',
  },
  good: {
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgLight: 'bg-blue-50',
    icon: TrendingUp,
    label: 'Good',
  },
  warning: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    bgLight: 'bg-yellow-50',
    icon: AlertCircle,
    label: 'Warning',
  },
  critical: {
    color: 'bg-red-500',
    textColor: 'text-red-700',
    bgLight: 'bg-red-50',
    icon: AlertTriangle,
    label: 'Critical',
  },
};

function HealthGradeBadge({ grade }: { grade: ModelAnalytics['healthGrade'] }) {
  const config = healthGradeConfig[grade];
  const Icon = config.icon;

  return (
    <Badge
      className={`${config.bgLight} ${config.textColor} border-0 gap-1`}
      data-testid={`badge-health-${grade}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function QueueCapacityBar({ ratio, capacity }: { ratio: number; capacity: number }) {
  const percentage = Math.min(ratio * 100, 200);
  const barColor = ratio >= 2 ? 'bg-red-500' : ratio >= 1.5 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-24">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {ratio.toFixed(1)}x / {capacity} molds
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Queue to Capacity Ratio: {ratio.toFixed(2)}</p>
          <p>Mold Capacity: {capacity} per day</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DepartmentHeatmap({ breakdown }: { breakdown: ModelAnalytics['departmentBreakdown'] }) {
  const departments = [
    'P1 Production Queue',
    'Layup/Plugging',
    'Barcode',
    'CNC',
    'Gunsmith',
    'Finish',
    'Finish QC',
    'Paint',
    'Shipping QC',
    'Shipping',
  ];

  return (
    <div className="flex gap-1">
      {departments.map((dept) => {
        const data = breakdown[dept];
        if (!data || data.count === 0) {
          return (
            <div
              key={dept}
              className="w-4 h-4 bg-gray-100 rounded"
              title={`${dept}: 0`}
            />
          );
        }

        const lateCount = data.deptOverdue + data.cannotMeetDue + data.critical;
        const lateRatio = lateCount / data.count;
        let color = 'bg-green-400';
        if (lateRatio >= 0.5) color = 'bg-red-400';
        else if (lateRatio >= 0.25) color = 'bg-orange-400';
        else if (lateRatio > 0) color = 'bg-yellow-400';

        return (
          <TooltipProvider key={dept}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`w-4 h-4 ${color} rounded flex items-center justify-center text-[8px] text-white font-bold`}
                >
                  {data.count}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{dept}</p>
                <p>Total: {data.count}</p>
                <p className="text-green-600">On Schedule: {data.onSchedule}</p>
                <p className="text-yellow-600">Dept Overdue: {data.deptOverdue}</p>
                <p className="text-orange-600">Can't Meet Due: {data.cannotMeetDue}</p>
                <p className="text-red-600">Critical: {data.critical}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export default function ModelAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/model-analytics'],
    refetchInterval: 60000,
  });

  const { data: deptBreakdown, isLoading: breakdownLoading } = useQuery<DepartmentBreakdownResponse>({
    queryKey: ['/api/model-analytics/department-breakdown'],
    refetchInterval: 60000,
  });

  if (analyticsLoading || breakdownLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Model Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading model analytics...</div>
        </CardContent>
      </Card>
    );
  }

  const summary = analytics?.summary || {
    totalModels: 0,
    totalInPipeline: 0,
    criticalModels: 0,
    warningModels: 0,
  };

  const models = analytics?.models || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Model Analytics Dashboard
          </div>
          <div className="flex gap-2 items-center">
            <HistoricalDataUpload />
            <Badge variant="outline" data-testid="badge-total-pipeline">
              {summary.totalInPipeline} in Pipeline
            </Badge>
            {summary.criticalModels > 0 && (
              <Badge variant="destructive" data-testid="badge-critical-count">
                {summary.criticalModels} Critical
              </Badge>
            )}
            {summary.warningModels > 0 && (
              <Badge className="bg-yellow-500" data-testid="badge-warning-count">
                {summary.warningModels} Warning
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Track model production health, queue depth, and capacity utilization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-1" data-testid="tab-overview">
              <Layers className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="department" className="flex items-center gap-1" data-testid="tab-department">
              <Factory className="w-4 h-4" />
              By Department
            </TabsTrigger>
            <TabsTrigger value="capacity" className="flex items-center gap-1" data-testid="tab-capacity">
              <TrendingUp className="w-4 h-4" />
              Capacity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>In Pipeline</TableHead>
                    <TableHead>Queue/Capacity</TableHead>
                    <TableHead>Late %</TableHead>
                    <TableHead>Department Breakdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => (
                    <TableRow key={model.modelId} data-testid={`row-model-${model.modelId}`}>
                      <TableCell className="font-medium">
                        {model.displayName}
                      </TableCell>
                      <TableCell>
                        {model.isAdjustable ? (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                            <Clock className="w-3 h-3 mr-1" />
                            Adjustable
                          </Badge>
                        ) : (
                          <Badge variant="outline">Standard</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <HealthGradeBadge grade={model.healthGrade} />
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{model.totalInPipeline}</span>
                      </TableCell>
                      <TableCell>
                        <QueueCapacityBar
                          ratio={model.queueToCapacityRatio}
                          capacity={model.moldCapacity}
                        />
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            model.latePercentage >= 30
                              ? 'text-red-600 font-semibold'
                              : model.latePercentage >= 15
                              ? 'text-yellow-600'
                              : 'text-green-600'
                          }
                        >
                          {model.latePercentage.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <DepartmentHeatmap breakdown={model.departmentBreakdown} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {models.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No models currently in the production pipeline
              </div>
            )}
          </TabsContent>

          <TabsContent value="department">
            {deptBreakdown && (
              <div className="space-y-4">
                {deptBreakdown.departments.map((dept) => {
                  const deptModels = deptBreakdown.breakdown[dept] || {};
                  const modelEntries = Object.entries(deptModels).sort((a, b) => b[1] - a[1]);
                  const totalInDept = modelEntries.reduce((sum, [, count]) => sum + count, 0);

                  if (totalInDept === 0) return null;

                  return (
                    <Card key={dept} className="border-l-4 border-l-blue-500">
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          {dept}
                          <Badge variant="outline">{totalInDept} stocks</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {modelEntries.map(([modelName, count]) => (
                            <Badge
                              key={modelName}
                              variant="secondary"
                              className="text-xs"
                              data-testid={`badge-dept-${dept}-${modelName}`}
                            >
                              {modelName}: {count}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="capacity">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map((model) => {
                const utilizationPercent = Math.min(model.queueToCapacityRatio * 100, 100);
                const isOverCapacity = model.queueToCapacityRatio > 1;

                return (
                  <Card
                    key={model.modelId}
                    className={isOverCapacity ? 'border-red-200 bg-red-50' : ''}
                    data-testid={`card-capacity-${model.modelId}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        {model.displayName}
                        <HealthGradeBadge grade={model.healthGrade} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Queue: {model.totalInPipeline}</span>
                          <span>Capacity: {model.moldCapacity}/day</span>
                        </div>
                        <Progress
                          value={utilizationPercent}
                          className={isOverCapacity ? 'bg-red-200' : ''}
                        />
                        <div className="text-xs text-gray-500 text-center">
                          {isOverCapacity ? (
                            <span className="text-red-600 font-semibold">
                              Over capacity by {((model.queueToCapacityRatio - 1) * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span>
                              Est. {Math.ceil(model.totalInPipeline / model.moldCapacity)} days to clear
                            </span>
                          )}
                        </div>
                        {model.isAdjustable && (
                          <div className="text-xs text-purple-600 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Adjustable - may take longer
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {models.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No models currently in the production pipeline
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

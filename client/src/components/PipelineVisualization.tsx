import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const departments = [
  { name: 'Layup', color: 'bg-blue-500' },
  { name: 'Plugging', color: 'bg-orange-500' },
  { name: 'CNC', color: 'bg-green-500' },
  { name: 'Finish', color: 'bg-yellow-500' },
  { name: 'Gunsmith', color: 'bg-purple-500' },
  { name: 'Paint', color: 'bg-pink-500' },
  { name: 'QC', color: 'bg-indigo-500' },
  { name: 'Shipping', color: 'bg-gray-500' }
];

export default function PipelineVisualization() {
  const { data: pipelineCounts, isLoading } = useQuery({
    queryKey: ['/api/orders/pipeline-counts'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Production Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading pipeline data...</div>
        </CardContent>
      </Card>
    );
  }

  const totalOrders = Object.values(pipelineCounts || {}).reduce((sum, count) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Production Pipeline Overview
          <Badge variant="outline" className="text-sm">
            {totalOrders} Active Orders
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {departments.map((dept) => {
            const count = pipelineCounts?.[dept.name] || 0;
            const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
            
            return (
              <div key={dept.name} className="text-center space-y-2">
                <div className={`w-full h-16 ${dept.color} rounded-lg flex items-center justify-center text-white font-bold text-xl`}>
                  {count}
                </div>
                <div className="text-sm font-medium">{dept.name}</div>
                <Progress value={percentage} className="h-2" />
                <div className="text-xs text-gray-500">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Pipeline Flow Direction:</span>
            <div className="flex items-center space-x-2">
              {departments.map((dept, index) => (
                <React.Fragment key={dept.name}>
                  <span className="text-xs">{dept.name}</span>
                  {index < departments.length - 1 && <span>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
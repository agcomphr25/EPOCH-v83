import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Factory } from 'lucide-react';
import PipelineVisualization from '@/components/PipelineVisualization';

export default function STACITestDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">STACITEST Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Production Pipeline Overview & P2 Production Monitoring
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column - Production Pipeline Overview */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <span>Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineVisualization />
          </CardContent>
        </Card>

        {/* Right Column - P2 Production Pipeline Overview Placeholder */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-purple-100">
                <Factory className="w-5 h-5 text-purple-600" />
              </div>
              <span>P2 Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Factory className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                P2 Production Pipeline Overview
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section will display the P2 production pipeline visualization, 
                tracking P2 purchase orders through the manufacturing process.
              </p>
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Coming Soon: P2 Production Tracking
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Footer Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">📊</div>
            <div className="text-sm font-medium">P1 Production</div>
            <div className="text-xs text-gray-500">Active pipeline monitoring</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">🏭</div>
            <div className="text-sm font-medium">P2 Production</div>
            <div className="text-xs text-gray-500">Pipeline overview ready</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
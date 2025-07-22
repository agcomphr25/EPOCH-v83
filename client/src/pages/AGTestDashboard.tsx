import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Calendar, List, Maximize2, Minimize2 } from 'lucide-react';
import PipelineVisualization from '@/components/PipelineVisualization';
import AllOrdersList from '@/components/AllOrdersList';
import LayupScheduler from '@/components/LayupScheduler';

export default function AGTestDashboard() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleExpand = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">AGTEST Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Production Pipeline Overview, Order Management & Layup Scheduling
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Real-time Manufacturing Control Center
        </div>
      </div>

      {/* Dashboard Layout */}
      {!expandedSection ? (
        /* Grid Layout - Default View */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Production Pipeline Overview */}
          <Card className="xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg">Production Pipeline Overview</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand('pipeline')}
                className="text-gray-500 hover:text-gray-700"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <PipelineVisualization />
            </CardContent>
          </Card>

          {/* All Orders List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center space-x-2">
                <List className="w-5 h-5 text-green-600" />
                <CardTitle className="text-lg">All Orders</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand('orders')}
                className="text-gray-500 hover:text-gray-700"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <AllOrdersList />
              </div>
            </CardContent>
          </Card>

          {/* Layup Scheduler */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <CardTitle className="text-lg">Layup Scheduler</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand('scheduler')}
                className="text-gray-500 hover:text-gray-700"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <LayupScheduler />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Expanded View */
        <Card className="min-h-[80vh]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center space-x-2">
              {expandedSection === 'pipeline' && (
                <>
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-xl">Production Pipeline Overview - Expanded</CardTitle>
                </>
              )}
              {expandedSection === 'orders' && (
                <>
                  <List className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-xl">All Orders - Expanded</CardTitle>
                </>
              )}
              {expandedSection === 'scheduler' && (
                <>
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-xl">Layup Scheduler - Expanded</CardTitle>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedSection(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="h-full">
            {expandedSection === 'pipeline' && <PipelineVisualization />}
            {expandedSection === 'orders' && <AllOrdersList />}
            {expandedSection === 'scheduler' && <LayupScheduler />}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Pipeline Status</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Real-time production tracking across all departments
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <List className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium">Order Management</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Complete order lifecycle and department progression
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium">Layup Scheduling</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Drag & drop scheduling with automatic optimization
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
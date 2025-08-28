import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Calendar, List, Maximize2, Minimize2, Search, ArrowRight, Edit, QrCode, Users, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import PipelineVisualization from '@/components/PipelineVisualization';
import LayupScheduler from '@/components/LayupScheduler';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useLocation } from 'wouter';

export default function AGTestDashboard() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [, setLocation] = useLocation();

  const toggleExpand = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Get all orders with payment status
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/with-payment-status'],
  });

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Filter orders based on search term
  const filteredOrders = allOrders.filter((order: any) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      order.orderId?.toLowerCase().includes(searchLower) ||
      order.fbOrderNumber?.toLowerCase().includes(searchLower) ||
      order.customer?.toLowerCase().includes(searchLower) ||
      order.modelId?.toLowerCase().includes(searchLower)
    );
  });

  // Get stock model display name
  const getStockModelDisplayName = (modelId: string) => {
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Navigation functions
  const navigateTo = (path: string) => {
    setLocation(path);
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

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className="hover:shadow-md transition-all duration-200 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20"
          onClick={() => navigateTo('/layup-scheduler')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium">Layup Scheduler</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Drag & drop scheduling with automatic optimization
            </p>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all duration-200 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20"
          onClick={() => navigateTo('/all-orders')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <List className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">All Orders</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Complete order management and tracking system
            </p>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all duration-200 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20"
          onClick={() => navigateTo('/department-queue/barcode')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium">Barcode Manager</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Barcode scanning and label generation system
            </p>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
          onClick={() => navigateTo('/department-queue/finish')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Finish Manager</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Finish department queue and technician assignment
            </p>
          </CardContent>
        </Card>
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


          </CardContent>
        </Card>
      )}
    </div>
  );
}
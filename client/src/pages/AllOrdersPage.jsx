import React from 'react';
import AllOrdersList from '../components/AllOrdersList';
import PipelineVisualization from '../components/PipelineVisualization';

export default function AllOrdersPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
        <div className="text-sm text-gray-500">
          Department Progression & Pipeline Management
        </div>
      </div>
      
      {/* Pipeline Overview */}
      <PipelineVisualization />
      
      {/* Orders List with Department Actions */}
      <AllOrdersList />
    </div>
  );
}
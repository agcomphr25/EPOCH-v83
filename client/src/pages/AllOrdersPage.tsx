import React from 'react';
import AllOrdersList from '../components/AllOrdersList';

export default function AllOrdersPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
        <div className="text-sm text-gray-500">
          Order Management & Department Progression
        </div>
      </div>
      
      {/* Glenn Second Test Fork Button */}
      <div className="flex justify-start">
        <button className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded shadow-md transition-colors duration-200">
          Glenn Second Test Fork
        </button>
      </div>
      
      {/* Orders List with Department Actions */}
      <AllOrdersList />
    </div>
  );
}
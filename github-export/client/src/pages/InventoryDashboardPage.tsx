import React from 'react';
import InventoryDashboard from '../components/InventoryDashboard';

export default function InventoryDashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Inventory Dashboard</h1>
      <InventoryDashboard />
    </div>
  );
}
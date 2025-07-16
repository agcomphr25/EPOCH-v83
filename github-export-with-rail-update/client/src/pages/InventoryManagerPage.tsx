import React from 'react';
import InventoryManager from '../components/InventoryManager';

export default function InventoryManagerPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Inventory Overview</h1>
      <InventoryManager />
    </div>
  );
}
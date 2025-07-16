import React from 'react';
import InventoryScanner from '../components/InventoryScanner';

export default function InventoryScannerPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Inventory Scanner</h1>
      <InventoryScanner />
    </div>
  );
}
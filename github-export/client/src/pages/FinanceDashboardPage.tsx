import React from 'react';
import FinanceDashboard from '../components/FinanceDashboard';

export default function FinanceDashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Finance Dashboard</h1>
      <FinanceDashboard />
    </div>
  );
}
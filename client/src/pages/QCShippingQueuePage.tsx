
import React from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from 'lucide-react';

export default function QCShippingQueuePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-3xl font-bold">QC/Shipping Department Queue</h1>
      </div>
      
      {/* Barcode Scanner at top */}
      <BarcodeScanner />
      
      {/* Department Queue Content */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Control & Shipping Queue Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            This page will manage the quality control and shipping department queue.
            Orders scanned above will be processed for this department.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

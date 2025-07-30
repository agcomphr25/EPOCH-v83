
import React from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan } from 'lucide-react';

export default function BarcodeQueuePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Scan className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Barcode Department Queue</h1>
      </div>
      
      {/* Barcode Scanner at top */}
      <BarcodeScanner />
      
      {/* Department Queue Content */}
      <Card>
        <CardHeader>
          <CardTitle>Barcode Processing Queue Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            This page will manage the barcode processing department queue.
            Orders scanned above will be processed for this department.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

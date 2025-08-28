import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Simple test component to verify if the issue is with the complex OrderEntry
export default function OrderEntryTest() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Simple Order Entry Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="test-checkbox"
                className="rounded border-gray-300"
              />
              <label htmlFor="test-checkbox" className="text-sm">
                Test Checkbox
              </label>
            </div>
            
            <Button className="w-full">
              Test Button
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
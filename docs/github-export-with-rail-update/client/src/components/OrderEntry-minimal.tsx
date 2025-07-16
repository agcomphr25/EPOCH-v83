import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OrderEntry() {
  const [orderId, setOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Order Entry - Minimal Version</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="Enter order ID"
              />
            </div>
            
            <div>
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="test-checkbox"
                className="rounded border-gray-300"
              />
              <Label htmlFor="test-checkbox">Test Option</Label>
            </div>
            
            <Button className="w-full">
              Create Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
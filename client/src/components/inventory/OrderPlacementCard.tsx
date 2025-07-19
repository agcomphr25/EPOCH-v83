import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrderPlacementCard() {
  const [testMessage, setTestMessage] = useState<string>('Order Placement Card Loading...');

  const handleTestClick = () => {
    toast.success('Order Placement Card is working!');
    setTestMessage('Card is working properly!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold">Order Placement Card - Test Version</h3>
      </div>

      <div className="p-6 text-center">
        <p className="text-lg mb-4">{testMessage}</p>
        <Button onClick={handleTestClick} className="bg-purple-600 hover:bg-purple-700">
          Test Card
        </Button>
      </div>
    </div>
  );
}
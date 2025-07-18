import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, FileText, ShoppingCart, Plus, Import, Download } from 'lucide-react';
import InventoryItemsCard from '../components/inventory/InventoryItemsCard';
import PartsRequestsCard from '../components/inventory/PartsRequestsCard';
import OutstandingOrdersCard from '../components/inventory/OutstandingOrdersCard';
import OrderPlacementCard from '../components/inventory/OrderPlacementCard';

export default function NewInventoryManagerPage() {
  const [activeCard, setActiveCard] = useState<string | null>(null);

  const handleCardClick = (cardType: string) => {
    setActiveCard(activeCard === cardType ? null : cardType);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Inventory Management</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Manage inventory, parts requests, orders, and placements
        </div>
      </div>

      {/* Main Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Inventory Items Card */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-blue-500"
          onClick={() => handleCardClick('inventory')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-blue-600" />
              Inventory Items
            </CardTitle>
            <CardDescription>
              Manage inventory with full CRUD operations, import and export data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-blue-600">Items</div>
              <div className="flex gap-2">
                <Import className="h-4 w-4 text-gray-400" />
                <Download className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parts Requests Card */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-green-500"
          onClick={() => handleCardClick('parts-requests')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-green-600" />
              Parts Requests
            </CardTitle>
            <CardDescription>
              Submit and track requests for new parts and materials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-green-600">Requests</div>
              <Plus className="h-4 w-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Orders Card */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-yellow-500"
          onClick={() => handleCardClick('outstanding-orders')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingCart className="h-5 w-5 text-yellow-600" />
              Outstanding Orders
            </CardTitle>
            <CardDescription>
              View and manage pending and in-progress orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-yellow-600">Orders</div>
              <FileText className="h-4 w-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        {/* Order Placement Card */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-purple-500"
          onClick={() => handleCardClick('order-placement')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-purple-600" />
              Order Placement
            </CardTitle>
            <CardDescription>
              Place new orders for inventory and materials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-purple-600">New Order</div>
              <ShoppingCart className="h-4 w-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Card Content */}
      {activeCard && (
        <div className="mt-8">
          <Card className="border-t-4 border-t-blue-500">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl">
                  {activeCard === 'inventory' && 'Inventory Items Management'}
                  {activeCard === 'parts-requests' && 'Parts Requests Management'}
                  {activeCard === 'outstanding-orders' && 'Outstanding Orders'}
                  {activeCard === 'order-placement' && 'Order Placement'}
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveCard(null)}
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeCard === 'inventory' && <InventoryItemsCard />}
              {activeCard === 'parts-requests' && <PartsRequestsCard />}
              {activeCard === 'outstanding-orders' && <OutstandingOrdersCard />}
              {activeCard === 'order-placement' && <OrderPlacementCard />}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
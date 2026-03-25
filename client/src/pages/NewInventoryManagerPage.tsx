import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package,
  FileText,
  ShoppingCart,
  Plus,
  Import,
  Download,
  X,
  ChevronDown,
  ChevronRight,
  Settings2,
  Wrench,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { getSupplySourceDashboard, type ManufacturedCategory, type SupplySourceDashboard, type InventoryItemWithDashboard } from '@shared/schema';
import InventoryItemsCard from '../components/inventory/InventoryItemsCard';
import PartsRequestsCard from '../components/inventory/PartsRequestsCard';
import OutstandingOrdersCard from '../components/inventory/OutstandingOrdersCard';
import OrderPlacementCard from '../components/inventory/OrderPlacementCard';

const MANUFACTURED_CATEGORY_ORDER: ManufacturedCategory[] = [
  'PACKET',
  'KIT',
  'MACHINED_PART',
  'CORE',
  'SUB_ASSEMBLY',
  'ASSEMBLY',
];

const CATEGORY_DISPLAY_NAMES: Record<ManufacturedCategory, string> = {
  PACKET: 'Packet',
  KIT: 'Kit',
  MACHINED_PART: 'Machined Part',
  CORE: 'Core',
  SUB_ASSEMBLY: 'Sub-Assembly',
  ASSEMBLY: 'Assembly',
};

const DASHBOARD_DISPLAY_NAMES: Record<SupplySourceDashboard, string> = {
  CUTTING_TABLE: 'Cutting Table',
  CNC: 'CNC',
  CORE: 'Core',
  ASSEMBLY: 'Assembly',
};

function InventorySplitView() {
  const { data: allItems = [], isLoading } = useQuery<InventoryItemWithDashboard[]>({
    queryKey: ['/api/inventory/items'],
  });

  const purchasedItems = allItems.filter(
    (item) => item.itemType === 'PURCHASED' || (!item.itemType && item.type !== 'Manufactured' && !item.isPacket)
  );

  const manufacturedItems = allItems.filter(
    (item) => item.itemType === 'MANUFACTURED' || item.type === 'Manufactured' || item.isPacket
  );

  const groupedManufactured = MANUFACTURED_CATEGORY_ORDER.reduce((acc, cat) => {
    const items = manufacturedItems.filter((item) => {
      if (item.manufacturedCategory === cat) return true;
      if (!item.manufacturedCategory) {
        if (cat === 'PACKET' && item.isPacket) return true;
      }
      return false;
    });
    acc[cat] = items;
    return acc;
  }, {} as Record<ManufacturedCategory, InventoryItemWithDashboard[]>);

  const uncategorizedManufactured = manufacturedItems.filter(
    (item) => !item.manufacturedCategory && !item.isPacket
  );

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading inventory...</div>;
  }

  return (
    <Tabs defaultValue="purchased" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="purchased" className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Purchased
          <Badge variant="secondary" className="ml-1">{purchasedItems.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="manufactured" className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Manufactured
          <Badge variant="secondary" className="ml-1">{manufacturedItems.length}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="purchased">
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-4 text-left font-medium">AG Part #</th>
                <th className="h-10 px-4 text-left font-medium">Name</th>
                <th className="h-10 px-4 text-left font-medium">Source</th>
                <th className="h-10 px-4 text-left font-medium">Cost Per</th>
                <th className="h-10 px-4 text-left font-medium">Supplier Part #</th>
              </tr>
            </thead>
            <tbody>
              {purchasedItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No purchased items found
                  </td>
                </tr>
              ) : (
                purchasedItems.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs">{item.agPartNumber}</td>
                    <td className="px-4 py-2 font-medium">{item.name}</td>
                    <td className="px-4 py-2 text-gray-600">{item.source || '—'}</td>
                    <td className="px-4 py-2">{item.costPer != null ? `$${item.costPer.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{item.supplierPartNumber || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="manufactured">
        <Accordion type="multiple" className="space-y-2">
          {MANUFACTURED_CATEGORY_ORDER.map((category) => {
            const items = groupedManufactured[category] || [];
            const dashboard = getSupplySourceDashboard(category);
            return (
              <AccordionItem key={category} value={category} className="border rounded-md">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="font-semibold">{CATEGORY_DISPLAY_NAMES[category]}</span>
                    <Badge variant="outline">{items.length}</Badge>
                    {dashboard && (
                      <Badge variant="secondary" className="text-xs">
                        → {DASHBOARD_DISPLAY_NAMES[dashboard] ?? dashboard}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0">
                  <div className="rounded-b-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="h-9 px-4 text-left font-medium">AG Part #</th>
                          <th className="h-9 px-4 text-left font-medium">Name</th>
                          <th className="h-9 px-4 text-left font-medium">Level</th>
                          <th className="h-9 px-4 text-left font-medium">Dashboard</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-gray-500 text-xs">
                              No {CATEGORY_DISPLAY_NAMES[category]} items
                            </td>
                          </tr>
                        ) : (
                          items.map((item) => (
                            <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-2 font-mono text-xs">{item.agPartNumber}</td>
                              <td className="px-4 py-2 font-medium">{item.name}</td>
                              <td className="px-4 py-2">
                                {item.manufacturingLevel ? (
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {item.manufacturingLevel.toLowerCase()}
                                  </Badge>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2">
                                {item.supplySourceDashboard ? (
                                  <Badge variant="secondary" className="text-xs">
                                    {DASHBOARD_DISPLAY_NAMES[item.supplySourceDashboard] ?? item.supplySourceDashboard}
                                  </Badge>
                                ) : '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
          {uncategorizedManufactured.length > 0 && (
            <AccordionItem value="uncategorized" className="border rounded-md">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <span className="font-semibold text-amber-700">Uncategorized</span>
                  <Badge variant="outline">{uncategorizedManufactured.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-9 px-4 text-left font-medium">AG Part #</th>
                      <th className="h-9 px-4 text-left font-medium">Name</th>
                      <th className="h-9 px-4 text-left font-medium">Legacy Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uncategorizedManufactured.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-2 font-mono text-xs">{item.agPartNumber}</td>
                        <td className="px-4 py-2 font-medium">{item.name}</td>
                        <td className="px-4 py-2 text-gray-600">{item.type || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </TabsContent>
    </Tabs>
  );
}

export default function NewInventoryManagerPage() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [inventoryView, setInventoryView] = useState<'split' | 'full'>('split');

  const handleCardClick = (cardType: string) => {
    setActiveCard(activeCard === cardType ? null : cardType);
  };

  return (
    <div className="mx-auto p-6 space-y-6 max-w-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Inventory Management
        </h1>
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
              <div className="text-2xl font-bold text-purple-600">
                New Order
              </div>
              <ShoppingCart className="h-4 w-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Card Content */}
      {activeCard && (
        <div className="mt-8">
          <div className="border-t-4 border-t-blue-500 relative rounded-lg border bg-card text-card-foreground shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveCard(null)}
              data-testid="button-close-inventory"
              className="absolute top-4 right-4 z-10"
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex flex-col space-y-1.5 p-6">
              <div className="flex items-center gap-4">
                <div className="text-xl font-semibold leading-none tracking-tight">
                  {activeCard === 'inventory' && 'Inventory Items Management'}
                  {activeCard === 'parts-requests' && 'Parts Requests Management'}
                  {activeCard === 'outstanding-orders' && 'Outstanding Orders'}
                  {activeCard === 'order-placement' && 'Order Placement'}
                </div>
                {activeCard === 'inventory' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={inventoryView === 'split' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setInventoryView('split')}
                      className="h-7 text-xs"
                    >
                      <Settings2 className="h-3 w-3 mr-1" />
                      Categorized
                    </Button>
                    <Button
                      variant={inventoryView === 'full' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setInventoryView('full')}
                      className="h-7 text-xs"
                    >
                      Full List
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 pt-0">
              {activeCard === 'inventory' && inventoryView === 'split' && <InventorySplitView />}
              {activeCard === 'inventory' && inventoryView === 'full' && <InventoryItemsCard />}
              {activeCard === 'parts-requests' && <PartsRequestsCard />}
              {activeCard === 'outstanding-orders' && <OutstandingOrdersCard />}
              {activeCard === 'order-placement' && <OrderPlacementCard />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  Factory, 
  ShoppingCart, 
  BarChart3,
  Users,
  Truck,
  Settings,
  FileText,
  Target,
  Clock,
  CheckCircle
} from 'lucide-react';

// Import enhanced inventory components
import InventoryItemsCard from '../components/inventory/InventoryItemsCard';
import InventoryBalancesCard from '../components/inventory/InventoryBalancesCard';
import InventoryTransactionsCard from '../components/inventory/InventoryTransactionsCard';
import ProgressiveAllocationCard from '../components/inventory/ProgressiveAllocationCard';
import MRPCalculationCard from '../components/inventory/MRPCalculationCard';
import MRPShortagesCard from '../components/inventory/MRPShortagesCard';
import OutsideProcessingCard from '../components/inventory/OutsideProcessingCard';
import VendorPartsCard from '../components/inventory/VendorPartsCard';
import POSuggestionsCard from '../components/inventory/POSuggestionsCard';

export default function EnhancedInventoryMRPPage() {
  const [activeCard, setActiveCard] = useState<string | null>(null);

  const handleCardClick = (cardType: string) => {
    setActiveCard(activeCard === cardType ? null : cardType);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Enhanced Inventory & MRP System
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Comprehensive inventory management with material requirements planning and progressive allocation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            System Active
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            Real-time
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Real-time Inventory Management Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          Real-time Inventory Management
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Inventory Items Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-green-500"
            onClick={() => handleCardClick('inventory-items')}
            data-testid="card-inventory-items"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-green-600" />
                Inventory Items
              </CardTitle>
              <CardDescription>
                Manage inventory items, add new parts, and track item details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-green-600">Items</div>
                <div className="flex gap-2">
                  <Package className="h-4 w-4 text-gray-400" />
                  <Settings className="h-4 w-4 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Balances Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-blue-500"
            onClick={() => handleCardClick('inventory-balances')}
            data-testid="card-inventory-balances"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Inventory Balances
              </CardTitle>
              <CardDescription>
                Real-time inventory levels, stock locations, and low-stock alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-blue-600">Balances</div>
                <div className="flex gap-2">
                  <Target className="h-4 w-4 text-gray-400" />
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Transactions Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-green-500"
            onClick={() => handleCardClick('inventory-transactions')}
            data-testid="card-inventory-transactions"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Inventory Transactions
              </CardTitle>
              <CardDescription>
                Track all inventory movements with full audit trail
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-green-600">Transactions</div>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Progressive Allocation Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-purple-500"
            onClick={() => handleCardClick('progressive-allocation')}
            data-testid="card-progressive-allocation"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-purple-600" />
                Progressive Allocation
              </CardTitle>
              <CardDescription>
                Available → Allocated → Committed → Consumed workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-purple-600">Allocation</div>
                <Settings className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* MRP System Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Factory className="h-5 w-5 text-orange-600" />
          Material Requirements Planning (MRP)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* MRP Calculation Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-orange-500"
            onClick={() => handleCardClick('mrp-calculation')}
            data-testid="card-mrp-calculation"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-orange-600" />
                MRP Calculation
              </CardTitle>
              <CardDescription>
                Run MRP calculations and generate material requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-orange-600">Calculate</div>
                <Factory className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* MRP Shortages Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-red-500"
            onClick={() => handleCardClick('mrp-shortages')}
            data-testid="card-mrp-shortages"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Material Shortages
              </CardTitle>
              <CardDescription>
                Critical shortages and required actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-red-600">Shortages</div>
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
            </CardContent>
          </Card>

          {/* PO Suggestions Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-indigo-500"
            onClick={() => handleCardClick('po-suggestions')}
            data-testid="card-po-suggestions"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5 text-indigo-600" />
                PO Suggestions
              </CardTitle>
              <CardDescription>
                Auto-generated purchase order recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-indigo-600">Suggestions</div>
                <ShoppingCart className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Vendor & Processing Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Users className="h-5 w-5 text-cyan-600" />
          Vendor & Processing Management
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Outside Processing Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-cyan-500"
            onClick={() => handleCardClick('outside-processing')}
            data-testid="card-outside-processing"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-cyan-600" />
                Outside Processing
              </CardTitle>
              <CardDescription>
                Vendor processing locations and job tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-cyan-600">Processing</div>
                <Truck className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Vendor Parts Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-pink-500"
            onClick={() => handleCardClick('vendor-parts')}
            data-testid="card-vendor-parts"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-pink-600" />
                Vendor Parts
              </CardTitle>
              <CardDescription>
                Vendor relationships and parts mapping
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-pink-600">Vendors</div>
                <Users className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Expanded Card Content */}
      {activeCard && (
        <div className="mt-8">
          <Card className="border-t-4 border-t-blue-500">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center gap-2">
                  {activeCard === 'inventory-items' && <><Package className="h-5 w-5" />Inventory Items Management</>}
                  {activeCard === 'inventory-balances' && <><BarChart3 className="h-5 w-5" />Inventory Balances Management</>}
                  {activeCard === 'inventory-transactions' && <><TrendingUp className="h-5 w-5" />Inventory Transactions</>}
                  {activeCard === 'progressive-allocation' && <><Target className="h-5 w-5" />Progressive Allocation</>}
                  {activeCard === 'mrp-calculation' && <><Settings className="h-5 w-5" />MRP Calculation</>}
                  {activeCard === 'mrp-shortages' && <><AlertTriangle className="h-5 w-5" />Material Shortages</>}
                  {activeCard === 'po-suggestions' && <><ShoppingCart className="h-5 w-5" />Purchase Order Suggestions</>}
                  {activeCard === 'outside-processing' && <><Truck className="h-5 w-5" />Outside Processing</>}
                  {activeCard === 'vendor-parts' && <><Users className="h-5 w-5" />Vendor Parts Management</>}
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveCard(null)}
                  data-testid="button-close-card"
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeCard === 'inventory-items' && <InventoryItemsCard />}
              {activeCard === 'inventory-balances' && <InventoryBalancesCard />}
              {activeCard === 'inventory-transactions' && <InventoryTransactionsCard />}
              {activeCard === 'progressive-allocation' && <ProgressiveAllocationCard />}
              {activeCard === 'mrp-calculation' && <MRPCalculationCard />}
              {activeCard === 'mrp-shortages' && <MRPShortagesCard />}
              {activeCard === 'po-suggestions' && <POSuggestionsCard />}
              {activeCard === 'outside-processing' && <OutsideProcessingCard />}
              {activeCard === 'vendor-parts' && <VendorPartsCard />}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
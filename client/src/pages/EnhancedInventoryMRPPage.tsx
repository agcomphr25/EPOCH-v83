import React, { useState, useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  CheckCircle,
  ClipboardList,
} from 'lucide-react';

// Import enhanced inventory components
import InventoryItemsCard from '../components/inventory/InventoryItemsCard';
import InventoryBalancesCard from '../components/inventory/InventoryBalancesCard';
import InventoryTransactionsCard from '../components/inventory/InventoryTransactionsCard';
import ProgressiveAllocationCard from '../components/inventory/ProgressiveAllocationCard';
import MRPCalculationCard from '../components/inventory/MRPCalculationCard';
import MRPShortagesCard from '../components/inventory/MRPShortagesCard';
import OutsideProcessingCard from '../components/inventory/OutsideProcessingCard';
import POSuggestionsCard from '../components/inventory/POSuggestionsCard';
import VendorPOManager from '../components/inventory/VendorPOManager';
import VendorPOSettings from '../components/inventory/VendorPOSettings';

export default function EnhancedInventoryMRPPage() {
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [isInventoryItemsModalOpen, setIsInventoryItemsModalOpen] =
    useState(false);
  const [isVendorPOModalOpen, setIsVendorPOModalOpen] = useState(false);
  const [isPOSettingsModalOpen, setIsPOSettingsModalOpen] = useState(false);
  const [isOutsideProcessingModalOpen, setIsOutsideProcessingModalOpen] = useState(false);
  const [initialPartNumber, setInitialPartNumber] = useState<string | null>(null);

  const expandedPanelRef = useRef<HTMLDivElement>(null);

  // Auto-open inventory modal if partNumber is in URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const partNumber = params.get('partNumber');
    if (partNumber) {
      setInitialPartNumber(partNumber);
      setIsInventoryItemsModalOpen(true);
    }
  }, [searchParams]);

  // Scroll expanded panel into view when a card is activated
  useEffect(() => {
    if (activeCard && expandedPanelRef.current) {
      expandedPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeCard]);

  const handleCardClick = (cardType: string) => {
    if (cardType === 'inventory-items') {
      setIsInventoryItemsModalOpen(true);
    } else if (cardType === 'vendor-po') {
      setIsVendorPOModalOpen(true);
    } else if (cardType === 'po-settings') {
      setIsPOSettingsModalOpen(true);
    } else if (cardType === 'outside-processing') {
      setIsOutsideProcessingModalOpen(true);
    } else {
      setActiveCard(activeCard === cardType ? null : cardType);
    }
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
            Comprehensive inventory management with material requirements
            planning and progressive allocation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            System Active
          </Badge>
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
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
                Real-time inventory levels, stock locations, and low-stock
                alerts
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
                <div className="text-2xl font-bold text-green-600">
                  Transactions
                </div>
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
                <div className="text-2xl font-bold text-purple-600">
                  Allocation
                </div>
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
                <div className="text-2xl font-bold text-orange-600">
                  Calculate
                </div>
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
                <div className="text-2xl font-bold text-indigo-600">
                  Suggestions
                </div>
                <ShoppingCart className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Consolidated Parts Needs Card */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-purple-500"
            onClick={() => setLocation('/inventory/consolidated-needs')}
            data-testid="card-consolidated-needs"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-purple-600" />
                Consolidated Parts Needs
              </CardTitle>
              <CardDescription>
                View and manage all parts requests across departments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-purple-600">
                  Parts Needs
                </div>
                <ClipboardList className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Vendor & Processing Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Truck className="h-5 w-5 text-cyan-600" />
          Vendor & Procurement
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Vendor Purchase Orders Card */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-teal-500"
            onClick={() => handleCardClick('vendor-po')}
            data-testid="card-vendor-po"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5 text-teal-600" />
                Vendor Purchase Orders
              </CardTitle>
              <CardDescription>
                Create and manage purchase orders to vendors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-teal-600">
                  Vendor POs
                </div>
                <ShoppingCart className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* PO Settings Card */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-purple-500"
            onClick={() => handleCardClick('po-settings')}
            data-testid="card-po-settings"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-purple-600" />
                PO Settings
              </CardTitle>
              <CardDescription>
                Configure default terms and conditions for POs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-purple-600">
                  Settings
                </div>
                <Settings className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

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
                <div className="text-2xl font-bold text-cyan-600">
                  Processing
                </div>
                <Truck className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          Note: Vendor selection for parts is now integrated directly into the Inventory Items form
        </p>
      </div>

      {/* Inventory Items Modal */}
      <Dialog
        open={isInventoryItemsModalOpen}
        onOpenChange={setIsInventoryItemsModalOpen}
      >
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5" />
              Inventory Items Management
            </DialogTitle>
          </DialogHeader>
          <InventoryItemsCard initialSearchTerm={initialPartNumber} />
        </DialogContent>
      </Dialog>

      {/* Vendor Purchase Orders Modal */}
      <Dialog
        open={isVendorPOModalOpen}
        onOpenChange={setIsVendorPOModalOpen}
      >
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShoppingCart className="h-5 w-5" />
              Vendor Purchase Orders
            </DialogTitle>
          </DialogHeader>
          <VendorPOManager />
        </DialogContent>
      </Dialog>

      {/* PO Settings Modal */}
      <Dialog
        open={isPOSettingsModalOpen}
        onOpenChange={setIsPOSettingsModalOpen}
      >
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings className="h-5 w-5" />
              PO Settings
            </DialogTitle>
          </DialogHeader>
          <VendorPOSettings />
        </DialogContent>
      </Dialog>

      {/* Outside Processing Modal */}
      <Dialog
        open={isOutsideProcessingModalOpen}
        onOpenChange={setIsOutsideProcessingModalOpen}
      >
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Truck className="h-5 w-5" />
              Outside Processing
            </DialogTitle>
          </DialogHeader>
          <OutsideProcessingCard />
        </DialogContent>
      </Dialog>

      {/* Expanded Card Content */}
      {activeCard && (
        <div className="mt-8" ref={expandedPanelRef}>
          <Card className="border-t-4 border-t-blue-500">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center gap-2">
                  {activeCard === 'inventory-balances' && (
                    <>
                      <BarChart3 className="h-5 w-5" />
                      Inventory Balances Management
                    </>
                  )}
                  {activeCard === 'inventory-transactions' && (
                    <>
                      <TrendingUp className="h-5 w-5" />
                      Inventory Transactions
                    </>
                  )}
                  {activeCard === 'progressive-allocation' && (
                    <>
                      <Target className="h-5 w-5" />
                      Progressive Allocation
                    </>
                  )}
                  {activeCard === 'mrp-calculation' && (
                    <>
                      <Settings className="h-5 w-5" />
                      MRP Calculation
                    </>
                  )}
                  {activeCard === 'mrp-shortages' && (
                    <>
                      <AlertTriangle className="h-5 w-5" />
                      Material Shortages
                    </>
                  )}
                  {activeCard === 'po-suggestions' && (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      Purchase Order Suggestions
                    </>
                  )}
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
              {activeCard === 'inventory-balances' && <InventoryBalancesCard />}
              {activeCard === 'inventory-transactions' && (
                <InventoryTransactionsCard />
              )}
              {activeCard === 'progressive-allocation' && (
                <ProgressiveAllocationCard />
              )}
              {activeCard === 'mrp-calculation' && <MRPCalculationCard />}
              {activeCard === 'mrp-shortages' && <MRPShortagesCard />}
              {activeCard === 'po-suggestions' && <POSuggestionsCard />}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

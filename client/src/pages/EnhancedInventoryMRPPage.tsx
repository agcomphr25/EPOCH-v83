import React, { useState, useEffect } from 'react';
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
import { usePermissions } from '@/hooks/usePermissions';

export default function EnhancedInventoryMRPPage() {
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  const { can } = usePermissions();
  const [isInventoryItemsModalOpen, setIsInventoryItemsModalOpen] = useState(false);
  const [isVendorPOModalOpen, setIsVendorPOModalOpen] = useState(false);
  const [isPOSettingsModalOpen, setIsPOSettingsModalOpen] = useState(false);
  const [isOutsideProcessingModalOpen, setIsOutsideProcessingModalOpen] = useState(false);
  const [isBalancesModalOpen, setIsBalancesModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isProgressiveAllocModalOpen, setIsProgressiveAllocModalOpen] = useState(false);
  const [isMrpCalculationModalOpen, setIsMrpCalculationModalOpen] = useState(false);
  const [isMrpShortagesModalOpen, setIsMrpShortagesModalOpen] = useState(false);
  const [isPOSuggestionsModalOpen, setIsPOSuggestionsModalOpen] = useState(false);
  const [initialPartNumber, setInitialPartNumber] = useState<string | null>(null);
  const canSeeConsolidatedNeeds =
    can('purchasing.view_requisitions') ||
    can('purchasing.manage_pos') ||
    can('purchasing.approve_po');
  const returnTo = new URLSearchParams(searchParams).get('returnTo');
  const inventoryItemsCloseTarget =
    returnTo === 'consolidated-needs' ? '/inventory/consolidated-needs' : null;

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const partNumber = params.get('partNumber');
    if (partNumber) {
      setInitialPartNumber(partNumber);
      setIsInventoryItemsModalOpen(true);
    }
  }, [searchParams]);

  const handleCardClick = (cardType: string) => {
    if (cardType === 'inventory-items') {
      setIsInventoryItemsModalOpen(true);
    } else if (cardType === 'vendor-po') {
      setIsVendorPOModalOpen(true);
    } else if (cardType === 'po-settings') {
      setIsPOSettingsModalOpen(true);
    } else if (cardType === 'outside-processing') {
      setIsOutsideProcessingModalOpen(true);
    } else if (cardType === 'inventory-balances') {
      setIsBalancesModalOpen(true);
    } else if (cardType === 'inventory-transactions') {
      setIsTransactionsModalOpen(true);
    } else if (cardType === 'progressive-allocation') {
      setIsProgressiveAllocModalOpen(true);
    } else if (cardType === 'mrp-calculation') {
      setIsMrpCalculationModalOpen(true);
    } else if (cardType === 'mrp-shortages') {
      setIsMrpShortagesModalOpen(true);
    } else if (cardType === 'po-suggestions') {
      setIsPOSuggestionsModalOpen(true);
    }
  };

  const handleInventoryItemsModalOpenChange = (open: boolean) => {
    setIsInventoryItemsModalOpen(open);
    if (!open && inventoryItemsCloseTarget) {
      setLocation(inventoryItemsCloseTarget);
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

          {canSeeConsolidatedNeeds && (
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
          )}
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

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      <Dialog open={isInventoryItemsModalOpen} onOpenChange={handleInventoryItemsModalOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5" />
              Inventory Items Management
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            {isInventoryItemsModalOpen && (
              <InventoryItemsCard initialSearchTerm={initialPartNumber} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBalancesModalOpen} onOpenChange={setIsBalancesModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5" />
              Inventory Balances
            </DialogTitle>
          </DialogHeader>
          {isBalancesModalOpen && <InventoryBalancesCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isTransactionsModalOpen} onOpenChange={setIsTransactionsModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5" />
              Inventory Transactions
            </DialogTitle>
          </DialogHeader>
          {isTransactionsModalOpen && <InventoryTransactionsCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isProgressiveAllocModalOpen} onOpenChange={setIsProgressiveAllocModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Target className="h-5 w-5" />
              Progressive Allocation
            </DialogTitle>
          </DialogHeader>
          {isProgressiveAllocModalOpen && <ProgressiveAllocationCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isMrpCalculationModalOpen} onOpenChange={setIsMrpCalculationModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings className="h-5 w-5" />
              MRP Calculation
            </DialogTitle>
          </DialogHeader>
          {isMrpCalculationModalOpen && <MRPCalculationCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isMrpShortagesModalOpen} onOpenChange={setIsMrpShortagesModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5" />
              Material Shortages
            </DialogTitle>
          </DialogHeader>
          {isMrpShortagesModalOpen && <MRPShortagesCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isPOSuggestionsModalOpen} onOpenChange={setIsPOSuggestionsModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShoppingCart className="h-5 w-5" />
              PO Suggestions
            </DialogTitle>
          </DialogHeader>
          {isPOSuggestionsModalOpen && <POSuggestionsCard />}
        </DialogContent>
      </Dialog>

      <Dialog open={isVendorPOModalOpen} onOpenChange={setIsVendorPOModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShoppingCart className="h-5 w-5" />
              Vendor Purchase Orders
            </DialogTitle>
          </DialogHeader>
          {isVendorPOModalOpen && <VendorPOManager />}
        </DialogContent>
      </Dialog>

      <Dialog open={isPOSettingsModalOpen} onOpenChange={setIsPOSettingsModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings className="h-5 w-5" />
              PO Settings
            </DialogTitle>
          </DialogHeader>
          {isPOSettingsModalOpen && <VendorPOSettings />}
        </DialogContent>
      </Dialog>

      <Dialog open={isOutsideProcessingModalOpen} onOpenChange={setIsOutsideProcessingModalOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Truck className="h-5 w-5" />
              Outside Processing
            </DialogTitle>
          </DialogHeader>
          {isOutsideProcessingModalOpen && <OutsideProcessingCard />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

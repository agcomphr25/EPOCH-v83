import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  AlertTriangle,
  Package,
  MapPin,
  TrendingUp,
  TrendingDown,
  Edit,
  RefreshCw,
  Target,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DepartmentBalanceMeta {
  departmentId: number;
  departmentName: string;
  locationId: string;
}

interface DepartmentBalanceBreakdown {
  departmentId: number;
  departmentName: string;
  totalQuantityOnHand: number;
  totalQuantityAllocated: number;
  totalQuantityAvailable: number;
  locations: string[];
}

interface InventoryBalance {
  id: number;
  agPartNumber: string;
  locationId: string;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  reorderPoint: number | null;
  lastCountedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  partName?: string;
  departmentMeta?: DepartmentBalanceMeta;
  serializedItems?: SerializedInventoryItem[];
}

interface SerializedInventoryItem {
  id: string;
  serialNumber: string;
  barcode: string;
  travelerBarcode?: string | null;
  travelerId?: string | null;
  travelerNumber?: string | null;
  dispositionId?: number | null;
  dispositionType?: string | null;
}

interface BalancesResponse {
  balances: InventoryBalance[];
  departmentBreakdowns: Record<string, DepartmentBalanceBreakdown[]>;
}

interface UpdateBalanceData {
  quantityOnHand?: number;
  quantityAllocated?: number;
  reorderPoint?: number | null;
}

export default function InventoryBalancesCard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [editingBalance, setEditingBalance] = useState<InventoryBalance | null>(
    null
  );
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [selectedSerialByBalanceId, setSelectedSerialByBalanceId] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  // Fetch inventory balances with department metadata
  const {
    data: balancesData,
    isLoading,
    refetch,
  } = useQuery<BalancesResponse>({
    queryKey: ['/api/enhanced/inventory/balances'],
  });

  const balances = balancesData?.balances || [];
  const departmentBreakdowns = balancesData?.departmentBreakdowns || {};

  // Update balance mutation
  const updateBalanceMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: UpdateBalanceData;
    }) => {
      return await apiRequest(
        `/api/enhanced/inventory/balances/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/balances'],
      });
      toast.success('Inventory balance updated successfully');
      setIsEditDialogOpen(false);
      setEditingBalance(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update balance: ${error.message}`);
    },
  });

  const handleEditBalance = (balance: InventoryBalance) => {
    setEditingBalance(balance);
    setIsEditDialogOpen(true);
  };

  const handleUpdateBalance = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!editingBalance) return;

      const formData = new FormData(e.currentTarget);
      const updateData: UpdateBalanceData = {
        quantityOnHand: Number(formData.get('quantityOnHand')),
        reorderPoint: formData.get('reorderPoint') ? Number(formData.get('reorderPoint')) : null,
      };

      updateBalanceMutation.mutate({
        id: editingBalance.id,
        data: updateData,
      });
    },
    [editingBalance, updateBalanceMutation]
  );

  const getStockStatus = (balance: InventoryBalance) => {
    if (balance.quantityAvailable <= 0) {
      return {
        status: 'Out of Stock',
        color: 'bg-red-100 text-red-800',
        icon: AlertTriangle,
      };
    }
    if (balance.reorderPoint && balance.quantityAvailable <= balance.reorderPoint) {
      return {
        status: 'Low Stock',
        color: 'bg-yellow-100 text-yellow-800',
        icon: AlertTriangle,
      };
    }
    return {
      status: 'In Stock',
      color: 'bg-green-100 text-green-800',
      icon: Package,
    };
  };

  const getSelectedSerializedItem = (balance: InventoryBalance) => {
    const serializedItems = balance.serializedItems || [];
    if (serializedItems.length === 0) return null;

    const selectedId = selectedSerialByBalanceId[balance.id] || serializedItems[0].id;
    return serializedItems.find((item) => item.id === selectedId) || serializedItems[0];
  };

  const filteredBalances = balances.filter((balance) => {
    const matchesSearch =
      !searchQuery ||
      balance.agPartNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      balance.partName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLocation =
      !selectedLocationFilter || balance.locationId === selectedLocationFilter;

    const matchesDepartment =
      !selectedDepartmentFilter || 
      balance.departmentMeta?.departmentName === selectedDepartmentFilter;

    const matchesLowStock =
      !showLowStockOnly ||
      (balance.reorderPoint && balance.quantityAvailable <= balance.reorderPoint) ||
      balance.quantityAvailable <= 0;

    return matchesSearch && matchesLocation && matchesDepartment && matchesLowStock;
  });

  // Get unique locations and departments for filters
  const uniqueLocations = Array.from(
    new Set(balances.map((b) => b.locationId))
  );
  
  const uniqueDepartments = Array.from(
    new Set(balances.map((b) => b.departmentMeta?.departmentName).filter(Boolean))
  ) as string[];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Inventory Balances
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time inventory levels and progressive allocation tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-balances"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search">Search Parts</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Part ID or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-parts"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <select
                id="location"
                value={selectedLocationFilter}
                onChange={(e) => setSelectedLocationFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                data-testid="select-location-filter"
              >
                <option value="">All Locations</option>
                {uniqueLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="department">Department</Label>
              <select
                id="department"
                value={selectedDepartmentFilter}
                onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                data-testid="select-department-filter"
              >
                <option value="">All Departments</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="lowStock"
                checked={showLowStockOnly}
                onChange={(e) => setShowLowStockOnly(e.target.checked)}
                className="rounded border-gray-300"
                data-testid="checkbox-low-stock-only"
              />
              <Label htmlFor="lowStock" className="text-sm font-medium">
                Low Stock Only
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balances Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Parts
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {filteredBalances.length}
                </p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Low Stock Items
                </p>
                <p className="text-2xl font-bold text-yellow-600">
                  {
                    filteredBalances.filter(
                      (b) =>
                        (b.reorderPoint && b.quantityAvailable <= b.reorderPoint) ||
                        b.quantityAvailable <= 0
                    ).length
                  }
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Out of Stock
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {filteredBalances.filter((b) => b.quantityAvailable <= 0).length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Locations
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {uniqueLocations.length}
                </p>
              </div>
              <MapPin className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Balances Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Balances</CardTitle>
          <CardDescription>
            Real-time inventory levels with progressive allocation tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading balances...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Serialized Item</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBalances.map((balance, index) => {
                  const stockStatus = getStockStatus(balance);
                  const IconComponent = stockStatus.icon;
                  const deptBreakdown = departmentBreakdowns[balance.agPartNumber] || [];
                  const selectedSerializedItem = getSelectedSerializedItem(balance);
                  const travelerHref = selectedSerializedItem?.travelerId
                    ? `/travelers/${selectedSerializedItem.travelerId}`
                    : selectedSerializedItem?.barcode
                      ? `/p2-traveler-viewer?barcode=${encodeURIComponent(selectedSerializedItem.barcode)}`
                      : null;

                  return (
                    <TableRow
                      key={`${balance.agPartNumber}-${balance.locationId}-${index}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {balance.agPartNumber}
                          {deptBreakdown.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedPart(
                                expandedPart === balance.agPartNumber ? null : balance.agPartNumber
                              )}
                              data-testid={`button-expand-${balance.agPartNumber}`}
                            >
                              {expandedPart === balance.agPartNumber ? '▼' : '▶'}
                            </Button>
                          )}
                        </div>
                        {expandedPart === balance.agPartNumber && deptBreakdown.length > 0 && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                            <div className="font-semibold mb-1">Department Breakdown:</div>
                            {deptBreakdown.map((dept) => (
                              <div key={dept.departmentId} className="flex justify-between py-1">
                                <span>{dept.departmentName}</span>
                                <span className="font-mono">
                                  {dept.totalQuantityAvailable.toLocaleString()} available
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{balance.partName || 'Unknown'}</TableCell>
                      <TableCell>
                        {(balance.serializedItems || []).length > 0 && selectedSerializedItem ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedSerializedItem.id}
                              onChange={(e) =>
                                setSelectedSerialByBalanceId((current) => ({
                                  ...current,
                                  [balance.id]: e.target.value,
                                }))
                              }
                              className="h-8 w-40 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs ring-offset-background"
                              data-testid={`select-serialized-item-${balance.agPartNumber}`}
                            >
                              {balance.serializedItems!.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.serialNumber}
                                </option>
                              ))}
                            </select>
                            {travelerHref && (
                              <Link href={travelerHref}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title={selectedSerializedItem.travelerNumber || 'Open traveler'}
                                  data-testid={`link-traveler-${selectedSerializedItem.serialNumber}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {balance.departmentMeta ? (
                          <Badge variant="outline" className="text-xs">
                            {balance.departmentMeta.departmentName}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          {balance.locationId}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {balance.quantityOnHand.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-orange-600">
                        {balance.quantityAllocated.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {balance.quantityAvailable.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={stockStatus.color}>
                          <IconComponent className="h-3 w-3 mr-1" />
                          {stockStatus.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditBalance(balance)}
                          data-testid={`button-edit-balance-${balance.agPartNumber}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {!isLoading && filteredBalances.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No inventory balances found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Balance Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Update Inventory Balance</DialogTitle>
          </DialogHeader>
          {editingBalance && (
            <form onSubmit={handleUpdateBalance} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Part Number</Label>
                  <Input value={editingBalance.agPartNumber} disabled />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={editingBalance.locationId} disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantityOnHand">On Hand Quantity *</Label>
                  <Input
                    id="quantityOnHand"
                    name="quantityOnHand"
                    type="number"
                    min="0"
                    defaultValue={editingBalance.quantityOnHand}
                    required
                  />
                </div>
                <div>
                  <Label>Current Allocated</Label>
                  <Input value={editingBalance.quantityAllocated} disabled />
                </div>
              </div>

              <div>
                <Label htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  name="reorderPoint"
                  type="number"
                  min="0"
                  defaultValue={editingBalance.reorderPoint || ''}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateBalanceMutation.isPending}
                  data-testid="button-save-balance"
                >
                  {updateBalanceMutation.isPending
                    ? 'Saving...'
                    : 'Save Changes'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

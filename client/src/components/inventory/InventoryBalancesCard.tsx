import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  Target
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface InventoryBalance {
  partId: string;
  locationId: string;
  onHandQty: number;
  allocatedQty: number;
  availableQty: number;
  committedQty: number;
  reorderPoint: number | null;
  maxStockLevel: number | null;
  lastUpdated: Date;
  partName?: string;
  locationName?: string;
}

interface UpdateBalanceData {
  onHandQty?: number;
  allocatedQty?: number;
  reorderPoint?: number;
  maxStockLevel?: number;
}

export default function InventoryBalancesCard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [editingBalance, setEditingBalance] = useState<InventoryBalance | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch inventory balances
  const { data: balances = [], isLoading, refetch } = useQuery<InventoryBalance[]>({
    queryKey: ['/api/inventory/balances', { 
      partId: searchQuery, 
      locationId: selectedLocationFilter, 
      lowStock: showLowStockOnly 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('partId', searchQuery);
      if (selectedLocationFilter) params.append('locationId', selectedLocationFilter);
      if (showLowStockOnly) params.append('lowStock', 'true');
      
      const response = await apiRequest(`/api/inventory/balances?${params.toString()}`);
      return response;
    }
  });

  // Update balance mutation
  const updateBalanceMutation = useMutation({
    mutationFn: async ({ partId, locationId, data }: { 
      partId: string; 
      locationId: string; 
      data: UpdateBalanceData 
    }) => {
      return await apiRequest(`/api/inventory/balances/${partId}/${locationId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
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

  const handleUpdateBalance = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingBalance) return;

    const formData = new FormData(e.currentTarget);
    const updateData: UpdateBalanceData = {
      onHandQty: Number(formData.get('onHandQty')),
      reorderPoint: Number(formData.get('reorderPoint')) || null,
      maxStockLevel: Number(formData.get('maxStockLevel')) || null,
    };

    updateBalanceMutation.mutate({
      partId: editingBalance.partId,
      locationId: editingBalance.locationId,
      data: updateData
    });
  }, [editingBalance, updateBalanceMutation]);

  const getStockStatus = (balance: InventoryBalance) => {
    if (balance.availableQty <= 0) {
      return { status: 'Out of Stock', color: 'bg-red-100 text-red-800', icon: AlertTriangle };
    }
    if (balance.reorderPoint && balance.availableQty <= balance.reorderPoint) {
      return { status: 'Low Stock', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle };
    }
    return { status: 'In Stock', color: 'bg-green-100 text-green-800', icon: Package };
  };

  const filteredBalances = balances.filter(balance => {
    const matchesSearch = !searchQuery || 
      balance.partId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      balance.partName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLocation = !selectedLocationFilter || 
      balance.locationId === selectedLocationFilter;
    
    const matchesLowStock = !showLowStockOnly || 
      (balance.reorderPoint && balance.availableQty <= balance.reorderPoint) ||
      balance.availableQty <= 0;
    
    return matchesSearch && matchesLocation && matchesLowStock;
  });

  // Get unique locations for filter
  const uniqueLocations = Array.from(new Set(balances.map(b => b.locationId)));

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                {uniqueLocations.map(location => (
                  <option key={location} value={location}>{location}</option>
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Parts</p>
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Low Stock Items</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {filteredBalances.filter(b => 
                    (b.reorderPoint && b.availableQty <= b.reorderPoint) || b.availableQty <= 0
                  ).length}
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600">
                  {filteredBalances.filter(b => b.availableQty <= 0).length}
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Locations</p>
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
                  <TableHead>Part ID</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBalances.map((balance, index) => {
                  const stockStatus = getStockStatus(balance);
                  const IconComponent = stockStatus.icon;
                  
                  return (
                    <TableRow key={`${balance.partId}-${balance.locationId}-${index}`}>
                      <TableCell className="font-medium">{balance.partId}</TableCell>
                      <TableCell>{balance.partName || 'Unknown'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          {balance.locationId}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {balance.onHandQty.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-orange-600">
                        {balance.allocatedQty.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {balance.availableQty.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple-600">
                        {balance.committedQty.toLocaleString()}
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
                          data-testid={`button-edit-balance-${balance.partId}`}
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
                  <Label>Part ID</Label>
                  <Input value={editingBalance.partId} disabled />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={editingBalance.locationId} disabled />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="onHandQty">On Hand Quantity *</Label>
                  <Input
                    id="onHandQty"
                    name="onHandQty"
                    type="number"
                    min="0"
                    defaultValue={editingBalance.onHandQty}
                    required
                  />
                </div>
                <div>
                  <Label>Current Allocated</Label>
                  <Input value={editingBalance.allocatedQty} disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label htmlFor="maxStockLevel">Max Stock Level</Label>
                  <Input
                    id="maxStockLevel"
                    name="maxStockLevel"
                    type="number"
                    min="0"
                    defaultValue={editingBalance.maxStockLevel || ''}
                  />
                </div>
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
                  {updateBalanceMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
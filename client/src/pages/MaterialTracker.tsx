import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Package, 
  AlertTriangle, 
  MapPin, 
  TrendingDown, 
  Plus, 
  Search, 
  Building,
  Archive,
  DollarSign
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface MaterialInventory {
  id: number;
  materialName: string;
  materialType: string;
  currentStock: number;
  minimumStock: number;
  maximumStock: number;
  unit: string;
  locationBuilding: string;
  locationSection: string;
  locationShelf: string;
  supplier: string;
  costPerUnit: number;
  lastReceived: string;
  lastUpdated: string;
  notes: string;
  isActive: boolean;
}

export default function MaterialTracker() {
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [newMaterial, setNewMaterial] = useState({
    materialName: '',
    materialType: 'Carbon Fiber',
    currentStock: '',
    minimumStock: '',
    maximumStock: '',
    unit: 'lbs',
    locationBuilding: 'Building A',
    locationSection: '',
    locationShelf: '',
    supplier: '',
    costPerUnit: '',
    notes: ''
  });
  const [receiveData, setReceiveData] = useState({
    quantity: '',
    unitCost: '',
    supplier: '',
    purchaseOrder: '',
    receivedBy: '',
    notes: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get material inventory
  const { data: materials = [], isLoading } = useQuery<MaterialInventory[]>({
    queryKey: ['/api/material-inventory'],
    refetchInterval: 60000 // Refresh every minute
  });

  // Filter materials based on search and filters
  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.materialType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || material.materialType === filterType;
    
    let matchesStock = true;
    if (filterStock === 'low') {
      matchesStock = material.currentStock <= material.minimumStock;
    } else if (filterStock === 'critical') {
      matchesStock = material.currentStock < material.minimumStock * 0.5;
    } else if (filterStock === 'full') {
      matchesStock = material.currentStock >= material.maximumStock * 0.9;
    }
    
    return matchesSearch && matchesType && matchesStock;
  });

  // Add new material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/material-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          currentStock: parseInt(data.currentStock),
          minimumStock: parseInt(data.minimumStock),
          maximumStock: parseInt(data.maximumStock),
          costPerUnit: parseFloat(data.costPerUnit)
        }),
      });
      if (!response.ok) throw new Error('Failed to add material');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/material-inventory'] });
      setShowAddMaterial(false);
      setNewMaterial({
        materialName: '',
        materialType: 'Carbon Fiber',
        currentStock: '',
        minimumStock: '',
        maximumStock: '',
        unit: 'lbs',
        locationBuilding: 'Building A',
        locationSection: '',
        locationShelf: '',
        supplier: '',
        costPerUnit: '',
        notes: ''
      });
      toast({
        title: "Success",
        description: "Material added to inventory",
      });
    }
  });

  // Receive material mutation
  const receiveMaterialMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/material-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          materialId: selectedMaterial?.id,
          quantity: parseInt(data.quantity),
          unitCost: parseFloat(data.unitCost),
          totalCost: parseInt(data.quantity) * parseFloat(data.unitCost)
        }),
      });
      if (!response.ok) throw new Error('Failed to record material receipt');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/material-inventory'] });
      setShowReceiveDialog(false);
      setSelectedMaterial(null);
      setReceiveData({
        quantity: '',
        unitCost: '',
        supplier: '',
        purchaseOrder: '',
        receivedBy: '',
        notes: ''
      });
      toast({
        title: "Success",
        description: "Material receipt recorded",
      });
    }
  });

  const getStockStatusColor = (material: MaterialInventory) => {
    if (material.currentStock <= material.minimumStock * 0.5) {
      return 'text-red-600 bg-red-50 border-red-200';
    } else if (material.currentStock <= material.minimumStock) {
      return 'text-orange-600 bg-orange-50 border-orange-200';
    } else if (material.currentStock >= material.maximumStock * 0.9) {
      return 'text-blue-600 bg-blue-50 border-blue-200';
    }
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getStockStatusText = (material: MaterialInventory) => {
    if (material.currentStock <= material.minimumStock * 0.5) {
      return 'CRITICAL';
    } else if (material.currentStock <= material.minimumStock) {
      return 'LOW STOCK';
    } else if (material.currentStock >= material.maximumStock * 0.9) {
      return 'FULL';
    }
    return 'NORMAL';
  };

  // Calculate summary stats
  const totalMaterials = materials.length;
  const lowStockCount = materials.filter(m => m.currentStock <= m.minimumStock).length;
  const criticalCount = materials.filter(m => m.currentStock <= m.minimumStock * 0.5).length;
  const totalValue = materials.reduce((sum, m) => sum + (m.currentStock * m.costPerUnit), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Material Tracker</h1>
        </div>
        <Button onClick={() => setShowAddMaterial(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Material
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Archive className="h-8 w-8 mx-auto text-blue-600 mb-2" />
            <div className="text-2xl font-bold text-blue-600">{totalMaterials}</div>
            <div className="text-sm text-gray-600">Total Materials</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingDown className="h-8 w-8 mx-auto text-orange-600 mb-2" />
            <div className="text-2xl font-bold text-orange-600">{lowStockCount}</div>
            <div className="text-sm text-gray-600">Low Stock</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-red-600 mb-2" />
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <div className="text-sm text-gray-600">Critical</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <DollarSign className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <div className="text-2xl font-bold text-green-600">${totalValue.toFixed(0)}</div>
            <div className="text-sm text-gray-600">Total Value</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-64">
              <Label htmlFor="search">Search Materials</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by name, type, or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="filter-type">Material Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Carbon Fiber">Carbon Fiber</SelectItem>
                  <SelectItem value="Fiberglass">Fiberglass</SelectItem>
                  <SelectItem value="Primtex">Primtex</SelectItem>
                  <SelectItem value="Chemicals">Chemicals</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filter-stock">Stock Level</Label>
              <Select value={filterStock} onValueChange={setFilterStock}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="full">Full Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials Grid */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">Loading materials...</div>
            </CardContent>
          </Card>
        ) : filteredMaterials.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                No materials found matching your criteria
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredMaterials.map(material => (
            <Card key={material.id} className={getStockStatusColor(material)}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{material.materialName}</h3>
                    <Badge variant="outline">{material.materialType}</Badge>
                    <Badge className={getStockStatusColor(material)}>
                      {getStockStatusText(material)}
                    </Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowReceiveDialog(true);
                    }}
                  >
                    Receive Stock
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Current Stock</div>
                    <div className="text-2xl font-bold">
                      {material.currentStock} {material.unit}
                    </div>
                    <div className="text-gray-500">
                      Min: {material.minimumStock} | Max: {material.maximumStock}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Location
                    </div>
                    <div>{material.locationBuilding}</div>
                    <div className="text-gray-500">
                      {material.locationSection} {material.locationShelf && `- ${material.locationShelf}`}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium">Supplier</div>
                    <div>{material.supplier || 'Not specified'}</div>
                    <div className="text-gray-500">
                      ${material.costPerUnit?.toFixed(2)}/{material.unit}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium">Last Received</div>
                    <div>
                      {material.lastReceived ? format(new Date(material.lastReceived), 'MMM dd, yyyy') : 'Never'}
                    </div>
                    <div className="text-gray-500">
                      Value: ${(material.currentStock * material.costPerUnit).toFixed(0)}
                    </div>
                  </div>
                </div>

                {material.notes && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="font-medium text-sm">Notes</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{material.notes}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Material Dialog */}
      <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="material-name">Material Name</Label>
                <Input
                  id="material-name"
                  value={newMaterial.materialName}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, materialName: e.target.value }))}
                  placeholder="Enter material name"
                />
              </div>
              <div>
                <Label htmlFor="material-type">Material Type</Label>
                <Select value={newMaterial.materialType} onValueChange={(value) => setNewMaterial(prev => ({ ...prev, materialType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Carbon Fiber">Carbon Fiber</SelectItem>
                    <SelectItem value="Fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="Primtex">Primtex</SelectItem>
                    <SelectItem value="Chemicals">Chemicals</SelectItem>
                    <SelectItem value="Hardware">Hardware</SelectItem>
                    <SelectItem value="Tools">Tools</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="current-stock">Current Stock</Label>
                <Input
                  id="current-stock"
                  type="number"
                  min="0"
                  value={newMaterial.currentStock}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, currentStock: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="minimum-stock">Minimum Stock</Label>
                <Input
                  id="minimum-stock"
                  type="number"
                  min="0"
                  value={newMaterial.minimumStock}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, minimumStock: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="maximum-stock">Maximum Stock</Label>
                <Input
                  id="maximum-stock"
                  type="number"
                  min="0"
                  value={newMaterial.maximumStock}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, maximumStock: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select value={newMaterial.unit} onValueChange={(value) => setNewMaterial(prev => ({ ...prev, unit: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lbs">lbs</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="sheets">sheets</SelectItem>
                    <SelectItem value="rolls">rolls</SelectItem>
                    <SelectItem value="gallons">gallons</SelectItem>
                    <SelectItem value="pieces">pieces</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="building">Building</Label>
                <Select value={newMaterial.locationBuilding} onValueChange={(value) => setNewMaterial(prev => ({ ...prev, locationBuilding: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Building A">Building A</SelectItem>
                    <SelectItem value="Building B">Building B</SelectItem>
                    <SelectItem value="Building C">Building C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="section">Section</Label>
                <Input
                  id="section"
                  value={newMaterial.locationSection}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, locationSection: e.target.value }))}
                  placeholder="e.g. Section 1"
                />
              </div>
              <div>
                <Label htmlFor="shelf">Shelf (Optional)</Label>
                <Input
                  id="shelf"
                  value={newMaterial.locationShelf}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, locationShelf: e.target.value }))}
                  placeholder="e.g. Shelf A1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={newMaterial.supplier}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, supplier: e.target.value }))}
                  placeholder="Supplier name"
                />
              </div>
              <div>
                <Label htmlFor="cost-per-unit">Cost per Unit ($)</Label>
                <Input
                  id="cost-per-unit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMaterial.costPerUnit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, costPerUnit: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={newMaterial.notes}
                onChange={(e) => setNewMaterial(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this material..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddMaterial(false)}>
                Cancel
              </Button>
              <Button onClick={() => addMaterialMutation.mutate(newMaterial)} disabled={addMaterialMutation.isPending}>
                Add Material
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive Material Dialog */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Material: {selectedMaterial?.materialName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity Received</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={receiveData.quantity}
                  onChange={(e) => setReceiveData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder={`Enter quantity in ${selectedMaterial?.unit}`}
                />
              </div>
              <div>
                <Label htmlFor="unit-cost">Unit Cost ($)</Label>
                <Input
                  id="unit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={receiveData.unitCost}
                  onChange={(e) => setReceiveData(prev => ({ ...prev, unitCost: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier-receive">Supplier</Label>
                <Input
                  id="supplier-receive"
                  value={receiveData.supplier}
                  onChange={(e) => setReceiveData(prev => ({ ...prev, supplier: e.target.value }))}
                  placeholder="Supplier name"
                />
              </div>
              <div>
                <Label htmlFor="po-number">Purchase Order</Label>
                <Input
                  id="po-number"
                  value={receiveData.purchaseOrder}
                  onChange={(e) => setReceiveData(prev => ({ ...prev, purchaseOrder: e.target.value }))}
                  placeholder="PO Number"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="received-by">Received By</Label>
              <Input
                id="received-by"
                value={receiveData.receivedBy}
                onChange={(e) => setReceiveData(prev => ({ ...prev, receivedBy: e.target.value }))}
                placeholder="Employee name"
              />
            </div>

            <div>
              <Label htmlFor="receipt-notes">Notes (Optional)</Label>
              <Textarea
                id="receipt-notes"
                value={receiveData.notes}
                onChange={(e) => setReceiveData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any notes about this receipt..."
                rows={3}
              />
            </div>

            {receiveData.quantity && receiveData.unitCost && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="flex justify-between text-sm">
                  <span>Total Cost:</span>
                  <span className="font-bold">
                    ${(parseFloat(receiveData.quantity) * parseFloat(receiveData.unitCost)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => receiveMaterialMutation.mutate(receiveData)} 
                disabled={receiveMaterialMutation.isPending || !receiveData.quantity}
              >
                Record Receipt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
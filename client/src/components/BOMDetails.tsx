import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Edit, Trash2, Package, Search, GitBranch, Layers } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest } from "@/lib/queryClient";
import { BOMItemForm } from "./BOMItemForm";
import { SubAssemblyDialog } from "./SubAssemblyDialog";
import type { InventoryItem } from '@shared/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BomItem {
  id: number;
  bomId: number;
  partName: string;
  quantity: number;
  firstDept: string;
  itemType: string;
  referenceBomId?: number;
  assemblyLevel: number;
  quantityMultiplier: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface HierarchicalBomItem extends BomItem {
  subAssembly?: {
    bomDefinition: BomDefinition;
    calculatedQuantity: number;
  };
}

interface BomDefinition {
  id: number;
  modelName: string;
  revision: string;
  description?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: BomItem[];
  hierarchicalItems?: HierarchicalBomItem[];
}

interface BOMDetailsProps {
  bomId: number;
  onBack: () => void;
}

export function BOMDetails({ bomId, onBack }: BOMDetailsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [isSubAssemblyOpen, setIsSubAssemblyOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [viewMode, setViewMode] = useState<'flat' | 'hierarchical'>('hierarchical');
  const queryClient = useQueryClient();

  // Fetch BOM details with items
  const { data: bom, isLoading } = useQuery<BomDefinition>({
    queryKey: [`/api/p2-boms/${bomId}/details`],
  });

  // Also fetch hierarchical structure
  const { data: hierarchyData } = useQuery({
    queryKey: [`/api/p2-boms/${bomId}/hierarchy`],
    enabled: viewMode === 'hierarchical',
  });

  // Fetch inventory items to get part numbers
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/items"],
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest(`/api/p2-boms/${bomId}/items/${itemId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/hierarchy`] });
      toast.success("Item deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete item");
    },
  });

  // Helper function to get AG Part Number for a BOM item
  const getPartNumber = (partName: string) => {
    const inventoryItem = inventoryItems.find(item => item.name === partName);
    return inventoryItem?.agPartNumber || "N/A";
  };

  // Filter items based on search term and view mode
  const filteredItems = bom?.items?.filter(item => 
    item.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.firstDept.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getPartNumber(item.partName).toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Filter hierarchical items based on search term
  const filteredHierarchicalItems = hierarchyData?.hierarchicalItems?.filter((item: any) => 
    item.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.firstDept.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getPartNumber(item.partName).toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDeleteItem = (itemId: number) => {
    if (confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      deleteItemMutation.mutate(itemId);
    }
  };

  const handleItemCreated = () => {
    setIsNewItemOpen(false);
    queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/details`] });
    toast.success("Item added successfully");
  };

  const handleItemUpdated = () => {
    setEditingItem(null);
    queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/details`] });
    toast.success("Item updated successfully");
  };

  const handleSubAssemblyCreated = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/details`] });
    queryClient.invalidateQueries({ queryKey: [`/api/p2-boms/${bomId}/hierarchy`] });
    toast.success("Sub-assembly created successfully");
  };

  // Calculate total quantity based on view mode
  const totalQuantity = viewMode === 'hierarchical' 
    ? filteredHierarchicalItems.reduce((sum: number, item: any) => sum + item.quantity, 0)
    : filteredItems.reduce((sum, item) => sum + item.quantity, 0);

  // Get items to display based on view mode
  const itemsToDisplay = viewMode === 'hierarchical' ? filteredHierarchicalItems : filteredItems;

  // Hierarchical item rendering component
  const renderHierarchicalItem = (item: any, level: number = 0) => {
    const indentStyle = level > 0 ? { paddingLeft: `${level * 1.5}rem` } : {};
    const isSubAssembly = !!item.subAssembly;
    
    return (
      <React.Fragment key={`${item.id}-${level}`}>
        <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-800">
          <TableCell className="font-mono text-sm" style={indentStyle}>
            {level > 0 && <span className="text-gray-400 mr-2">{'└─'}</span>}
            {getPartNumber(item.partName)}
          </TableCell>
          <TableCell className="font-medium">
            <div className="flex items-center" style={indentStyle}>
              {level > 0 && <span className="text-gray-400 mr-2">└─</span>}
              {isSubAssembly && <GitBranch className="w-4 h-4 mr-2 text-blue-600" />}
              {item.partName}
              {isSubAssembly && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Sub-Assembly
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell>
            {item.quantity}
            {isSubAssembly && item.subAssembly?.calculatedQuantity && (
              <span className="text-gray-500 text-sm ml-2">
                (× {item.subAssembly.calculatedQuantity} = {item.quantity * item.subAssembly.calculatedQuantity})
              </span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant="outline">{item.firstDept}</Badge>
          </TableCell>
          <TableCell>
            <Badge variant={item.itemType === 'manufactured' ? "default" : "secondary"}>
              {item.itemType === 'manufactured' ? "Manufactured" : "Material"}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant={item.isActive ? "default" : "secondary"}>
              {item.isActive ? "Active" : "Inactive"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingItem(item)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteItem(item.id)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
        {/* Render sub-assembly items recursively */}
        {isSubAssembly && item.subAssembly?.bomDefinition?.items?.map((subItem: any) => 
          renderHierarchicalItem(subItem, level + 1)
        )}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h2 className="text-xl font-semibold text-gray-600 mb-4">BOM Not Found</h2>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to BOMs
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {bom.modelName} - {bom.revision}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {bom.description || "No description available"}
              </p>
            </div>
            <Badge variant={bom.isActive ? "default" : "secondary"}>
              {bom.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline"
              onClick={() => setIsSubAssemblyOpen(true)}
              className="border-green-600 text-green-600 hover:bg-green-50"
            >
              <GitBranch className="w-4 h-4 mr-2" />
              Add Sub-Assembly  
            </Button>
            <Dialog open={isNewItemOpen} onOpenChange={setIsNewItemOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add BOM Item</DialogTitle>
                  <DialogDescription>
                    Add a new component to this Bill of Materials
                  </DialogDescription>
                </DialogHeader>
                <BOMItemForm 
                  bomId={bomId}
                  onSuccess={handleItemCreated}
                  onCancel={() => setIsNewItemOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* BOM Info & Search */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Items:</span>
              <span className="ml-2 font-semibold">{filteredItems.length}</span>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Quantity:</span>
              <span className="ml-2 font-semibold">{totalQuantity}</span>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Last Updated:</span>
              <span className="ml-2 font-semibold">
                {new Date(bom.updatedAt).toLocaleDateString()}
              </span>
            </div>
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2 ml-6">
              <Button
                variant={viewMode === 'flat' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('flat')}
              >
                <Layers className="w-4 h-4 mr-1" />
                Flat
              </Button>
              <Button
                variant={viewMode === 'hierarchical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('hierarchical')}
              >
                <GitBranch className="w-4 h-4 mr-1" />
                Hierarchical
              </Button>
            </div>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Notes section */}
      {bom.notes && (
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Notes:</strong> {bom.notes}
          </p>
        </div>
      )}

      {/* Items table */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {itemsToDisplay.length === 0 ? (
            <Card>
              <CardHeader className="text-center">
                <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <CardTitle className="text-gray-600">No Items Found</CardTitle>
                <CardDescription>
                  {searchTerm ? "No items match your search criteria." : "This BOM doesn't have any items yet. Add the first component to get started."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  BOM Components
                </CardTitle>
                <CardDescription>
                  Components and materials required for {bom.modelName}
                  {viewMode === 'hierarchical' && (
                    <span className="ml-2 text-blue-600 text-sm">
                      • Showing hierarchical structure with sub-assemblies
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part #</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>First Department</TableHead>
                      <TableHead>Item Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewMode === 'hierarchical' 
                      ? itemsToDisplay.map((item: any) => renderHierarchicalItem(item, 0))
                      : itemsToDisplay.map((item) => (
                          <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <TableCell className="font-mono text-sm">{getPartNumber(item.partName)}</TableCell>
                            <TableCell className="font-medium">{item.partName}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.firstDept}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.itemType === 'manufactured' ? "default" : "secondary"}>
                                {item.itemType === 'manufactured' ? "Manufactured" : "Material"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.isActive ? "default" : "secondary"}>
                                {item.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingItem(item)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    }
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit BOM Item</DialogTitle>
            <DialogDescription>
              Update the component details
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <BOMItemForm 
              bomId={bomId}
              item={editingItem}
              onSuccess={handleItemUpdated}
              onCancel={() => setEditingItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-Assembly Dialog */}
      <SubAssemblyDialog 
        open={isSubAssemblyOpen}
        onOpenChange={setIsSubAssemblyOpen}
        parentBomId={bomId}
        onSuccess={handleSubAssemblyCreated}
      />
    </div>
  );
}
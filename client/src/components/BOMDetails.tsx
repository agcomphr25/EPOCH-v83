import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Edit, Trash2, Package, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest } from "@/lib/queryClient";
import { BOMItemForm } from "./BOMItemForm";
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
}

interface BOMDetailsProps {
  bomId: number;
  onBack: () => void;
}

export function BOMDetails({ bomId, onBack }: BOMDetailsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const queryClient = useQueryClient();

  // Fetch BOM details with items
  const { data: bom, isLoading } = useQuery<BomDefinition>({
    queryKey: ["/api/boms", bomId],
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest(`/api/boms/${bomId}/items/${itemId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boms", bomId] });
      toast.success("Item deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete item");
    },
  });

  // Filter items based on search term
  const filteredItems = bom?.items?.filter(item => 
    item.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.firstDept.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDeleteItem = (itemId: number) => {
    if (confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      deleteItemMutation.mutate(itemId);
    }
  };

  const handleItemCreated = () => {
    setIsNewItemOpen(false);
    queryClient.invalidateQueries({ queryKey: ["/api/boms", bomId] });
    toast.success("Item added successfully");
  };

  const handleItemUpdated = () => {
    setEditingItem(null);
    queryClient.invalidateQueries({ queryKey: ["/api/boms", bomId] });
    toast.success("Item updated successfully");
  };

  // Calculate total quantity
  const totalQuantity = filteredItems.reduce((sum, item) => {
    return sum + item.quantity;
  }, 0);

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
          {filteredItems.length === 0 ? (
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
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>First Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell className="font-medium">{item.partName}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.firstDept}</Badge>
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
                    ))}
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
    </div>
  );
}
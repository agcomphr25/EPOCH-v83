import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Package, Edit, Trash2, Eye } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest } from "@/lib/queryClient";
import { BOMDefinitionForm } from "../components/BOMDefinitionForm";
import { BOMDetails } from "../components/BOMDetails";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BomDefinition } from "@shared/schema";

export function BOMAdministration() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBOM, setSelectedBOM] = useState<number | null>(null);
  const [isNewBOMOpen, setIsNewBOMOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BomDefinition | null>(null);
  const queryClient = useQueryClient();

  // Fetch all BOMs
  const { data: boms = [], isLoading } = useQuery<BomDefinition[]>({
    queryKey: ["/api/boms"],
  });

  // Delete BOM mutation
  const deleteBOMMutation = useMutation({
    mutationFn: async (bomId: number) => {
      await apiRequest(`/api/boms/${bomId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boms"] });
      toast.success("BOM deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete BOM");
    },
  });

  // Filter BOMs based on search term
  const filteredBOMs = boms.filter(bom => 
    bom.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bom.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bom.revision.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteBOM = (bomId: number) => {
    if (confirm("Are you sure you want to delete this BOM? This action cannot be undone.")) {
      deleteBOMMutation.mutate(bomId);
    }
  };

  const handleBOMCreated = () => {
    setIsNewBOMOpen(false);
    queryClient.invalidateQueries({ queryKey: ["/api/boms"] });
    toast.success("BOM created successfully");
  };

  const handleBOMUpdated = () => {
    setEditingBOM(null);
    queryClient.invalidateQueries({ queryKey: ["/api/boms"] });
    toast.success("BOM updated successfully");
  };

  if (selectedBOM) {
    return (
      <BOMDetails 
        bomId={selectedBOM} 
        onBack={() => setSelectedBOM(null)} 
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">BOM Administration</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage Bill of Materials for P2 Operations</p>
          </div>
          <Dialog open={isNewBOMOpen} onOpenChange={setIsNewBOMOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                New BOM
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New BOM</DialogTitle>
                <DialogDescription>
                  Create a new Bill of Materials for a P2 product model
                </DialogDescription>
              </DialogHeader>
              <BOMDefinitionForm 
                onSuccess={handleBOMCreated}
                onCancel={() => setIsNewBOMOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and filters */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search BOMs by model, description, or revision..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {filteredBOMs.length} of {boms.length} BOMs
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredBOMs.length === 0 ? (
            <Card>
              <CardHeader className="text-center">
                <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <CardTitle className="text-gray-600">No BOMs Found</CardTitle>
                <CardDescription>
                  {searchTerm ? "No BOMs match your search criteria." : "Get started by creating your first BOM."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Bill of Materials
                </CardTitle>
                <CardDescription>
                  Manage and organize component lists for P2 product models
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Model Name</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBOMs.map((bom) => (
                      <TableRow key={bom.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell className="text-sm text-gray-600">{bom.sku || "—"}</TableCell>
                        <TableCell className="font-medium">{bom.modelName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{bom.revision}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {bom.description || "No description"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={bom.isActive ? "default" : "secondary"}>
                            {bom.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {bom.updatedAt ? new Date(bom.updatedAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedBOM(bom.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingBOM(bom)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBOM(bom.id)}
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

      {/* Edit BOM Dialog */}
      <Dialog open={!!editingBOM} onOpenChange={() => setEditingBOM(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit BOM</DialogTitle>
            <DialogDescription>
              Update the Bill of Materials definition
            </DialogDescription>
          </DialogHeader>
          {editingBOM && (
            <BOMDefinitionForm 
              bom={editingBOM as any}
              onSuccess={handleBOMUpdated}
              onCancel={() => setEditingBOM(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
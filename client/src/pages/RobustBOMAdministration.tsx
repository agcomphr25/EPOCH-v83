import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  TreePine, 
  DollarSign, 
  Clock, 
  Copy,
  FileText,
  Package,
  Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BOMTreeView } from '@/components/robust-bom/BOMTreeView';
import { WhereUsedView } from '@/components/robust-bom/WhereUsedView';
import { CostAnalysisView } from '@/components/robust-bom/CostAnalysisView';
import { AuditLogView } from '@/components/robust-bom/AuditLogView';
import { BOMDefinitionForm } from '../components/BOMDefinitionForm';
import { BOMDetails } from '../components/BOMDetails';
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

interface BOMSearchResult {
  items: BomDefinition[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function RobustBOMAdministration() {
  const [activeTab, setActiveTab] = useState('boms');
  const [selectedBOM, setSelectedBOM] = useState<BomDefinition | null>(null);
  const [selectedBOMId, setSelectedBOMId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewBOMOpen, setIsNewBOMOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BomDefinition | null>(null);
  const queryClient = useQueryClient();

  // Fetch all BOMs for robust administration
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
    bom.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bom.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bom.revision.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bom.sku?.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleViewBOM = (bom: BomDefinition) => {
    setSelectedBOM(bom);
    setSelectedBOMId(bom.id);
    setActiveTab('bom-tree');
  };

  // If viewing BOM details, show the details page
  if (selectedBOMId) {
    return (
      <BOMDetails 
        bomId={selectedBOMId} 
        onBack={() => {
          setSelectedBOMId(null);
          setSelectedBOM(null);
          setActiveTab('boms');
        }} 
      />
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="page-robust-bom">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">
          P2 Robust BOM Administration
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2" data-testid="text-page-description">
          Advanced BOM management with lifecycle tracking, cost rollup, and comprehensive audit trails
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6" data-testid="tabs-main-navigation">
          <TabsTrigger value="boms" className="flex items-center gap-2" data-testid="tab-boms">
            <FileText className="h-4 w-4" />
            BOM Master
          </TabsTrigger>
          <TabsTrigger value="bom-tree" className="flex items-center gap-2" data-testid="tab-bom-tree">
            <TreePine className="h-4 w-4" />
            BOM Tree
          </TabsTrigger>
          <TabsTrigger value="where-used" className="flex items-center gap-2" data-testid="tab-where-used">
            <Search className="h-4 w-4" />
            Where Used
          </TabsTrigger>
          <TabsTrigger value="cost-analysis" className="flex items-center gap-2" data-testid="tab-cost-analysis">
            <DollarSign className="h-4 w-4" />
            Cost Analysis
          </TabsTrigger>
        </TabsList>

        {/* BOM Master Tab */}
        <TabsContent value="boms" className="space-y-6">
          <Card data-testid="card-bom-master">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    BOM Master Management
                  </CardTitle>
                  <CardDescription>
                    Manage Bill of Materials with advanced tracking and cost analysis
                  </CardDescription>
                </div>
                <Dialog open={isNewBOMOpen} onOpenChange={setIsNewBOMOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-bom">
                      <Plus className="w-4 h-4 mr-2" />
                      Add New BOM
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
            </CardHeader>
            <CardContent>
              {/* Search Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="search-boms">Search BOMs</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="search-boms"
                      placeholder="Search by SKU, model, description, or revision..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-boms"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <div className="text-sm text-gray-600 dark:text-gray-400 pt-3">
                    {filteredBOMs.length} of {boms.length} BOMs
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              {/* BOMs List */}
              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-8" data-testid="loading-boms">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Loading BOMs...</p>
                  </div>
                ) : filteredBOMs.length === 0 ? (
                  <div className="text-center py-8" data-testid="no-boms-found">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">
                      {searchQuery ? "No BOMs found matching your criteria" : "No BOMs found"}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {searchQuery ? "Try adjusting your search" : "Get started by creating your first BOM"}
                    </p>
                  </div>
                ) : (
                  <Card>
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
                            <TableRow key={bom.id} className="hover:bg-gray-50 dark:hover:bg-gray-800" data-testid={`row-bom-${bom.id}`}>
                              <TableCell className="text-sm text-gray-600">
                                {bom.sku || "—"}
                              </TableCell>
                              <TableCell className="font-medium">
                                {bom.modelName}
                              </TableCell>
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
                                    onClick={() => handleViewBOM(bom)}
                                    data-testid={`button-view-${bom.id}`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingBOM(bom)}
                                    data-testid={`button-edit-${bom.id}`}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteBOM(bom.id)}
                                    className="text-red-600 hover:text-red-700"
                                    data-testid={`button-delete-${bom.id}`}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOM Tree Tab */}
        <TabsContent value="bom-tree">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                BOM Tree View
              </CardTitle>
              <CardDescription>
                {selectedBOM ? `Viewing BOM tree for ${selectedBOM.modelName}` : "Select a BOM from the BOM Master tab to view its tree structure"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBOM ? (
                <div className="text-center py-8">
                  <TreePine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">BOM Tree view for {selectedBOM.modelName}</p>
                  <p className="text-sm text-gray-400 mt-1">Component tree structure will be displayed here</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <TreePine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No BOM selected</p>
                  <p className="text-sm text-gray-400 mt-1">Select a BOM from the BOM Master tab to view its structure</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Where Used Tab */}
        <TabsContent value="where-used">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Where Used Analysis
              </CardTitle>
              <CardDescription>
                {selectedBOM ? `Where ${selectedBOM.modelName} is used` : "Select a BOM to see where it's used"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBOM ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Where used analysis for {selectedBOM.modelName}</p>
                  <p className="text-sm text-gray-400 mt-1">Usage relationships will be displayed here</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No BOM selected</p>
                  <p className="text-sm text-gray-400 mt-1">Select a BOM to see where it's used</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Analysis Tab */}
        <TabsContent value="cost-analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Cost Analysis
              </CardTitle>
              <CardDescription>
                {selectedBOM ? `Cost breakdown for ${selectedBOM.modelName}` : "Select a BOM to analyze costs"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBOM ? (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Cost analysis for {selectedBOM.modelName}</p>
                  <p className="text-sm text-gray-400 mt-1">Cost rollup and analysis will be displayed here</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No BOM selected</p>
                  <p className="text-sm text-gray-400 mt-1">Select a BOM to analyze costs</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
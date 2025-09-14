import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  TreePine, 
  DollarSign, 
  Clock, 
  AlertTriangle,
  Copy,
  FileText,
  BarChart3
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PartsManager } from '@/components/robust-bom/PartsManager';
import { BOMTreeView } from '@/components/robust-bom/BOMTreeView';
import { WhereUsedView } from '@/components/robust-bom/WhereUsedView';
import { CostAnalysisView } from '@/components/robust-bom/CostAnalysisView';
import { AuditLogView } from '@/components/robust-bom/AuditLogView';

interface Part {
  id: string;
  sku: string;
  name: string;
  type: 'PURCHASED' | 'MANUFACTURED' | 'PHANTOM';
  uom: string;
  purchaseUom: string;
  conversionFactor: number;
  stdCost: number;
  revision?: string;
  description?: string;
  lifecycleStatus: 'ACTIVE' | 'OBSOLETE' | 'DISCONTINUED' | 'PHASE_OUT';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  items: Part[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function RobustBOMAdministration() {
  const [activeTab, setActiveTab] = useState('parts');
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();

  // Search parts query
  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult>({
    queryKey: ['robust-bom', 'parts', 'search', searchQuery, typeFilter, lifecycleFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: searchQuery,
        type: typeFilter,
        lifecycleStatus: lifecycleFilter,
        page: currentPage.toString(),
        pageSize: '20'
      });
      
      const response = await fetch(`/api/robust-bom/parts/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search parts');
      }
      return response.json();
    }
  });

  const getLifecycleBadgeColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500';
      case 'OBSOLETE': return 'bg-red-500';
      case 'DISCONTINUED': return 'bg-gray-500';
      case 'PHASE_OUT': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'PURCHASED': return 'bg-blue-500';
      case 'MANUFACTURED': return 'bg-purple-500';
      case 'PHANTOM': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

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
        <TabsList className="grid w-full grid-cols-5 mb-6" data-testid="tabs-main-navigation">
          <TabsTrigger value="parts" className="flex items-center gap-2" data-testid="tab-parts">
            <FileText className="h-4 w-4" />
            Parts Master
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
          <TabsTrigger value="audit-log" className="flex items-center gap-2" data-testid="tab-audit-log">
            <Clock className="h-4 w-4" />
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* Parts Master Tab */}
        <TabsContent value="parts" className="space-y-6">
          <Card data-testid="card-parts-master">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Parts Master Management
              </CardTitle>
              <CardDescription>
                Manage parts with lifecycle status, UoM handling, and cost tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search and Filter Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="search-parts">Search Parts</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="search-parts"
                      placeholder="Search by SKU, name, or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-parts"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="filter-type">Part Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger data-testid="select-type-filter">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="PURCHASED">Purchased</SelectItem>
                      <SelectItem value="MANUFACTURED">Manufactured</SelectItem>
                      <SelectItem value="PHANTOM">Phantom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-lifecycle">Lifecycle Status</Label>
                  <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                    <SelectTrigger data-testid="select-lifecycle-filter">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="OBSOLETE">Obsolete</SelectItem>
                      <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                      <SelectItem value="PHASE_OUT">Phase Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <Button 
                    className="w-full" 
                    onClick={() => setSelectedPart(null)}
                    data-testid="button-add-part"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Part
                  </Button>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Parts List */}
              <div className="space-y-4">
                {isSearching ? (
                  <div className="text-center py-8" data-testid="loading-parts">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Searching parts...</p>
                  </div>
                ) : searchResults?.items.length === 0 ? (
                  <div className="text-center py-8" data-testid="no-parts-found">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No parts found matching your criteria</p>
                    <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {searchResults?.items.map((part) => (
                        <Card 
                          key={part.id} 
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedPart(part)}
                          data-testid={`card-part-${part.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-semibold text-lg" data-testid={`text-part-sku-${part.id}`}>
                                  {part.sku}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300" data-testid={`text-part-name-${part.id}`}>
                                  {part.name}
                                </p>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Badge 
                                  className={`text-white ${getLifecycleBadgeColor(part.lifecycleStatus)}`}
                                  data-testid={`badge-lifecycle-${part.id}`}
                                >
                                  {part.lifecycleStatus}
                                </Badge>
                                <Badge 
                                  className={`text-white ${getTypeBadgeColor(part.type)}`}
                                  data-testid={`badge-type-${part.id}`}
                                >
                                  {part.type}
                                </Badge>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-500">UoM:</span>
                                <span className="ml-1 font-medium" data-testid={`text-uom-${part.id}`}>
                                  {part.uom}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Cost:</span>
                                <span className="ml-1 font-medium" data-testid={`text-cost-${part.id}`}>
                                  ${part.stdCost.toFixed(2)}
                                </span>
                              </div>
                            </div>
                            
                            {part.description && (
                              <p className="text-xs text-gray-500 mt-2 line-clamp-2" data-testid={`text-description-${part.id}`}>
                                {part.description}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Pagination */}
                    {searchResults && searchResults.totalPages > 1 && (
                      <div className="flex justify-center items-center gap-4 mt-6">
                        <Button
                          variant="outline"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          data-testid="button-previous-page"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600" data-testid="text-pagination">
                          Page {currentPage} of {searchResults.totalPages} 
                          ({searchResults.total} total parts)
                        </span>
                        <Button
                          variant="outline"
                          disabled={currentPage === searchResults.totalPages}
                          onClick={() => setCurrentPage(prev => Math.min(searchResults.totalPages, prev + 1))}
                          data-testid="button-next-page"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOM Tree Tab */}
        <TabsContent value="bom-tree">
          <BOMTreeView selectedPart={selectedPart} />
        </TabsContent>

        {/* Where Used Tab */}
        <TabsContent value="where-used">
          <WhereUsedView selectedPart={selectedPart} />
        </TabsContent>

        {/* Cost Analysis Tab */}
        <TabsContent value="cost-analysis">
          <CostAnalysisView selectedPart={selectedPart} />
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit-log">
          <AuditLogView selectedPart={selectedPart} />
        </TabsContent>
      </Tabs>

      {/* Parts Manager Modal/Sidebar */}
      {selectedPart !== null && (
        <PartsManager
          part={selectedPart}
          onClose={() => setSelectedPart(null)}
          onSave={() => {
            setSelectedPart(null);
            queryClient.invalidateQueries({ queryKey: ['robust-bom', 'parts'] });
            toast.success('Part saved successfully');
          }}
        />
      )}
    </div>
  );
}
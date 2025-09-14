import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TreePine, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  DollarSign,
  Package,
  Calculator,
  AlertTriangle,
  Search
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Part {
  id: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
  stdCost: number;
  lifecycleStatus: string;
}

interface BOMLine {
  id: string;
  parentPartId: string;
  childPartId: string;
  qtyPer: number;
  uom: string;
  scrapPct: number;
  notes?: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  childPart: Part;
  children?: BOMLine[];
  extendedCost: number;
}

interface BOMTree {
  rootPart: Part;
  children: BOMLine[];
  totalCost: number;
}

interface BOMTreeViewProps {
  selectedPart: Part | null;
}

export function BOMTreeView({ selectedPart }: BOMTreeViewProps) {
  const [selectedNode, setSelectedNode] = useState<BOMLine | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchPart, setSearchPart] = useState('');
  const [targetPartForClone, setTargetPartForClone] = useState('');
  const queryClient = useQueryClient();

  // Get BOM tree data
  const { data: bomTree, isLoading: isLoadingTree, error } = useQuery<BOMTree>({
    queryKey: ['robust-bom', 'tree', selectedPart?.id, includeInactive],
    queryFn: async () => {
      if (!selectedPart?.id) throw new Error('No part selected');
      const params = new URLSearchParams({ includeInactive: includeInactive.toString() });
      const response = await fetch(`/api/robust-bom/bom/${selectedPart.id}/tree?${params}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch BOM tree');
      }
      return response.json();
    },
    enabled: !!selectedPart?.id
  });

  // Search parts for adding to BOM
  const { data: searchResults } = useQuery({
    queryKey: ['robust-bom', 'parts', 'search', searchPart],
    queryFn: async () => {
      if (!searchPart || searchPart.length < 2) return { items: [] };
      const params = new URLSearchParams({ q: searchPart, pageSize: '10' });
      const response = await fetch(`/api/robust-bom/parts/search?${params}`);
      if (!response.ok) throw new Error('Failed to search parts');
      return response.json();
    },
    enabled: searchPart.length >= 2
  });

  // Add BOM line mutation
  const addBomLineMutation = useMutation({
    mutationFn: async (bomLineData: any) => {
      return await apiRequest('/api/robust-bom/bom/lines', {
        method: 'POST',
        body: JSON.stringify(bomLineData)
      });
    },
    onSuccess: () => {
      toast.success('BOM line added successfully');
      queryClient.invalidateQueries({ queryKey: ['robust-bom', 'tree'] });
      setShowAddDialog(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to add BOM line: ${error.message}`);
    }
  });

  // Clone BOM mutation
  const cloneBomMutation = useMutation({
    mutationFn: async ({ sourcePartId, targetPartId }: { sourcePartId: string; targetPartId: string }) => {
      return await apiRequest(`/api/robust-bom/bom/${sourcePartId}/clone/${targetPartId}`, {
        method: 'POST'
      });
    },
    onSuccess: (data: any) => {
      toast.success(`BOM cloned successfully. ${data.clonedLines} lines copied.`);
      queryClient.invalidateQueries({ queryKey: ['robust-bom', 'tree'] });
      setShowCloneDialog(false);
      setTargetPartForClone('');
    },
    onError: (error: any) => {
      toast.error(`Failed to clone BOM: ${error.message}`);
    }
  });

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderBOMNode = (bomLine: BOMLine, depth = 0) => {
    const isExpanded = expandedNodes.has(bomLine.id);
    const hasChildren = bomLine.children && bomLine.children.length > 0;
    const isObsolete = bomLine.childPart.lifecycleStatus === 'OBSOLETE';

    return (
      <div key={bomLine.id} className="space-y-1">
        <div 
          className={`flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer
            ${selectedNode?.id === bomLine.id ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : ''}
            ${isObsolete ? 'opacity-60' : ''}`}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => setSelectedNode(bomLine)}
          data-testid={`bom-node-${bomLine.childPart.sku}`}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(bomLine.id);
              }}
              data-testid={`button-toggle-${bomLine.childPart.sku}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : (
            <div className="h-6 w-6" />
          )}

          <Package className="h-4 w-4 text-gray-400" />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm" data-testid={`text-part-sku-${bomLine.childPart.sku}`}>
                {bomLine.childPart.sku}
              </span>
              <Badge variant="secondary" className="text-xs" data-testid={`badge-type-${bomLine.childPart.sku}`}>
                {bomLine.childPart.type}
              </Badge>
              {isObsolete && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  OBSOLETE
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate" data-testid={`text-part-name-${bomLine.childPart.sku}`}>
              {bomLine.childPart.name}
            </p>
          </div>

          <div className="text-right text-sm">
            <div className="font-medium" data-testid={`text-quantity-${bomLine.childPart.sku}`}>
              {bomLine.qtyPer} {bomLine.uom}
            </div>
            {bomLine.scrapPct > 0 && (
              <div className="text-xs text-orange-500">
                +{bomLine.scrapPct}% scrap
              </div>
            )}
          </div>

          <div className="text-right text-sm">
            <div className="font-medium" data-testid={`text-unit-cost-${bomLine.childPart.sku}`}>
              ${bomLine.childPart.stdCost.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500" data-testid={`text-extended-cost-${bomLine.childPart.sku}`}>
              Ext: ${bomLine.extendedCost.toFixed(2)}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {bomLine.children!.map(child => renderBOMNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!selectedPart) {
    return (
      <Card data-testid="card-no-part-selected">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TreePine className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Part Selected
          </h3>
          <p className="text-gray-500 text-center">
            Select a part from the Parts Master tab to view its BOM structure
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-bom-error">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Error Loading BOM
          </h3>
          <p className="text-red-500 text-center">
            {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card data-testid="card-bom-header">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                BOM Tree: {selectedPart.sku}
              </CardTitle>
              <CardDescription>
                {selectedPart.name} - Hierarchical bill of materials with cost rollup
              </CardDescription>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIncludeInactive(!includeInactive)}
                data-testid="button-toggle-inactive"
              >
                {includeInactive ? 'Hide Inactive' : 'Show Inactive'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                data-testid="button-add-bom-line"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCloneDialog(true)}
                data-testid="button-clone-bom"
              >
                <Copy className="h-4 w-4 mr-2" />
                Clone BOM
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BOM Tree */}
        <div className="lg:col-span-2">
          <Card data-testid="card-bom-tree">
            <CardHeader>
              <CardTitle className="text-sm">BOM Structure</CardTitle>
              <CardDescription>
                {bomTree ? `${bomTree.children.length} direct components` : 'Loading...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTree ? (
                <div className="text-center py-8" data-testid="loading-bom-tree">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading BOM tree...</p>
                </div>
              ) : bomTree && bomTree.children.length > 0 ? (
                <ScrollArea className="h-96">
                  <div className="space-y-1">
                    {bomTree.children.map(child => renderBOMNode(child))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8" data-testid="no-bom-lines">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No BOM lines found</p>
                  <p className="text-sm text-gray-400 mt-1">Add components to build the BOM structure</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details Panel */}
        <div className="space-y-4">
          {/* Cost Summary */}
          <Card data-testid="card-cost-summary">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Cost Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Part Cost:</span>
                  <span className="font-medium" data-testid="text-part-cost">
                    ${selectedPart.stdCost.toFixed(2)}
                  </span>
                </div>
                {bomTree && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Material Cost:</span>
                      <span className="font-medium" data-testid="text-material-cost">
                        ${(bomTree.totalCost - selectedPart.stdCost).toFixed(2)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="font-medium">Total Rolled Cost:</span>
                      <span className="font-bold text-lg" data-testid="text-total-cost">
                        ${bomTree.totalCost.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Selected Node Details */}
          {selectedNode && (
            <Card data-testid="card-selected-node">
              <CardHeader>
                <CardTitle className="text-sm">Selected Component</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium" data-testid="text-selected-sku">
                      {selectedNode.childPart.sku}
                    </p>
                    <p className="text-sm text-gray-500" data-testid="text-selected-name">
                      {selectedNode.childPart.name}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Qty per:</span>
                      <span className="ml-1 font-medium">
                        {selectedNode.qtyPer} {selectedNode.uom}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Level:</span>
                      <span className="ml-1 font-medium">{selectedNode.level}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Unit Cost:</span>
                      <span className="ml-1 font-medium">
                        ${selectedNode.childPart.stdCost.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ext Cost:</span>
                      <span className="ml-1 font-medium">
                        ${selectedNode.extendedCost.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {selectedNode.scrapPct > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Scrap:</span>
                      <span className="ml-1 font-medium text-orange-500">
                        {selectedNode.scrapPct}%
                      </span>
                    </div>
                  )}

                  {selectedNode.notes && (
                    <div className="text-sm">
                      <span className="text-gray-500">Notes:</span>
                      <p className="text-xs mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        {selectedNode.notes}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" data-testid="button-edit-line">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-delete-line">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add BOM Line Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="dialog-add-bom-line">
          <DialogHeader>
            <DialogTitle>Add BOM Line</DialogTitle>
            <DialogDescription>
              Add a component to {selectedPart.sku}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="search-component">Search Component</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search-component"
                  placeholder="Search by SKU or name..."
                  value={searchPart}
                  onChange={(e) => setSearchPart(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-component"
                />
              </div>
            </div>

            {searchResults && searchResults.items.length > 0 && (
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {searchResults.items.map((part: Part) => (
                  <div
                    key={part.id}
                    className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b last:border-b-0"
                    onClick={() => {
                      // Handle part selection
                      console.log('Selected part:', part);
                    }}
                    data-testid={`search-result-${part.sku}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{part.sku}</p>
                        <p className="text-xs text-gray-500">{part.name}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {part.type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button data-testid="button-confirm-add-line">
              Add Component
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone BOM Dialog */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent data-testid="dialog-clone-bom">
          <DialogHeader>
            <DialogTitle>Clone BOM Structure</DialogTitle>
            <DialogDescription>
              Copy the entire BOM structure from {selectedPart.sku} to another part
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="target-part">Target Part ID</Label>
              <Input
                id="target-part"
                placeholder="Enter target part ID..."
                value={targetPartForClone}
                onChange={(e) => setTargetPartForClone(e.target.value)}
                data-testid="input-target-part"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloneDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedPart?.id && targetPartForClone) {
                  cloneBomMutation.mutate({ 
                    sourcePartId: selectedPart.id, 
                    targetPartId: targetPartForClone 
                  });
                }
              }}
              disabled={!targetPartForClone || cloneBomMutation.isPending}
              data-testid="button-confirm-clone"
            >
              {cloneBomMutation.isPending ? 'Cloning...' : 'Clone BOM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
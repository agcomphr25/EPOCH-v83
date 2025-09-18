import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Package, 
  ArrowRight, 
  AlertTriangle,
  ExternalLink,
  Calculator
} from 'lucide-react';

interface Part {
  id: string;
  sku: string;
  name: string;
  type: string;
  lifecycleStatus: string;
}

interface WhereUsedItem {
  id: string;
  parentPartId: string;
  childPartId: string;
  qtyPer: number;
  uom: string;
  scrapPct: number;
  notes?: string;
  parentPart: Part;
  extendedQuantity: number;
}

interface WhereUsedViewProps {
  selectedPart: Part | null;
}

export function WhereUsedView({ selectedPart }: WhereUsedViewProps) {
  // Get where-used data - using authenticated default fetcher
  const { data: whereUsed, isLoading, error } = useQuery<WhereUsedItem[]>({
    queryKey: [`/api/robust-bom/parts/${selectedPart?.id}/where-used`],
    enabled: !!selectedPart?.id
  });

  if (!selectedPart) {
    return (
      <Card data-testid="card-no-part-selected">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Search className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Part Selected
          </h3>
          <p className="text-gray-500 text-center">
            Select a part from the Parts Master tab to view where it's used
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-where-used-error">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Error Loading Where-Used Data
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
      <Card data-testid="card-where-used-header">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Where Used: {selectedPart.sku}
          </CardTitle>
          <CardDescription>
            {selectedPart.name} - Shows all assemblies that use this component
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Where Used List */}
        <div className="lg:col-span-2">
          <Card data-testid="card-where-used-list">
            <CardHeader>
              <CardTitle className="text-sm">Usage Locations</CardTitle>
              <CardDescription>
                {isLoading ? 'Loading...' : whereUsed ? `Found in ${whereUsed.length} assemblies` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8" data-testid="loading-where-used">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading where-used data...</p>
                </div>
              ) : whereUsed && whereUsed.length > 0 ? (
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {whereUsed.map((item) => (
                      <Card 
                        key={item.id} 
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        data-testid={`where-used-item-${item.parentPart.sku}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Package className="h-5 w-5 text-gray-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium" data-testid={`text-parent-sku-${item.parentPart.sku}`}>
                                    {item.parentPart.sku}
                                  </span>
                                  <Badge 
                                    variant="secondary" 
                                    className="text-xs"
                                    data-testid={`badge-parent-type-${item.parentPart.sku}`}
                                  >
                                    {item.parentPart.type}
                                  </Badge>
                                  {item.parentPart.lifecycleStatus === 'OBSOLETE' && (
                                    <Badge variant="destructive" className="text-xs">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      OBSOLETE
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500" data-testid={`text-parent-name-${item.parentPart.sku}`}>
                                  {item.parentPart.name}
                                </p>
                              </div>
                            </div>

                            <ArrowRight className="h-4 w-4 text-gray-400" />

                            <div className="text-right">
                              <div className="font-medium" data-testid={`text-usage-quantity-${item.parentPart.sku}`}>
                                {item.qtyPer} {item.uom}
                              </div>
                              {item.scrapPct > 0 && (
                                <div className="text-xs text-orange-500">
                                  +{item.scrapPct}% scrap
                                </div>
                              )}
                              <div className="text-xs text-gray-500" data-testid={`text-extended-quantity-${item.parentPart.sku}`}>
                                Ext: {item.extendedQuantity.toFixed(3)}
                              </div>
                            </div>
                          </div>

                          {item.notes && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-gray-500" data-testid={`text-notes-${item.parentPart.sku}`}>
                                <strong>Notes:</strong> {item.notes}
                              </p>
                            </div>
                          )}

                          <div className="mt-2 pt-2 border-t flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs"
                              data-testid={`button-view-parent-${item.parentPart.sku}`}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Parent BOM
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8" data-testid="no-where-used">
                  <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">This part is not used in any assemblies</p>
                  <p className="text-sm text-gray-400 mt-1">
                    It may be a finished good or an unused component
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Usage Summary */}
        <div className="space-y-4">
          <Card data-testid="card-usage-summary">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Usage Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total Assemblies:</span>
                  <span className="font-medium" data-testid="text-total-assemblies">
                    {whereUsed?.length || 0}
                  </span>
                </div>

                {whereUsed && whereUsed.length > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Max Quantity:</span>
                      <span className="font-medium" data-testid="text-max-quantity">
                        {Math.max(...whereUsed.map(item => item.qtyPer)).toFixed(3)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Min Quantity:</span>
                      <span className="font-medium" data-testid="text-min-quantity">
                        {Math.min(...whereUsed.map(item => item.qtyPer)).toFixed(3)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Avg Quantity:</span>
                      <span className="font-medium" data-testid="text-avg-quantity">
                        {(whereUsed.reduce((sum, item) => sum + item.qtyPer, 0) / whereUsed.length).toFixed(3)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lifecycle Analysis */}
          {whereUsed && whereUsed.length > 0 && (
            <Card data-testid="card-lifecycle-analysis">
              <CardHeader>
                <CardTitle className="text-sm">Lifecycle Impact</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['ACTIVE', 'PHASE_OUT', 'OBSOLETE', 'DISCONTINUED'].map(status => {
                    const count = whereUsed.filter(item => item.parentPart.lifecycleStatus === status).length;
                    if (count === 0) return null;
                    
                    return (
                      <div key={status} className="flex justify-between items-center">
                        <Badge 
                          variant={status === 'ACTIVE' ? 'default' : status === 'OBSOLETE' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {status.replace('_', ' ')}
                        </Badge>
                        <span className="text-sm font-medium" data-testid={`text-lifecycle-count-${status}`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {whereUsed.some(item => item.parentPart.lifecycleStatus === 'OBSOLETE') && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                      <div className="text-xs text-red-700 dark:text-red-300">
                        <strong>Warning:</strong> This part is used in obsolete assemblies. 
                        Consider replacement or lifecycle review.
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
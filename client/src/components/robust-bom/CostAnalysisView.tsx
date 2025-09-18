import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  DollarSign, 
  TrendingUp, 
  Calculator, 
  AlertTriangle,
  BarChart3,
  PieChart
} from 'lucide-react';

interface Part {
  id: string;
  sku: string;
  name: string;
  type: string;
  stdCost: number;
}

interface CostRollup {
  partId: string;
  rolledUpCost: number;
  currency: string;
  calculatedAt: string;
}

interface CostAnalysisViewProps {
  selectedPart: Part | null;
}

export function CostAnalysisView({ selectedPart }: CostAnalysisViewProps) {
  // Get cost rollup data - using authenticated default fetcher
  const { data: costRollup, isLoading: isLoadingCost } = useQuery<CostRollup>({
    queryKey: [`/api/robust-bom/bom/${selectedPart?.id}/cost-rollup`],
    enabled: !!selectedPart?.id
  });

  // Get cost history - using authenticated default fetcher
  const { data: costHistory } = useQuery({
    queryKey: [`/api/robust-bom/parts/${selectedPart?.id}/cost-history?limit=20`],
    enabled: !!selectedPart?.id
  });

  if (!selectedPart) {
    return (
      <Card data-testid="card-no-part-selected">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Part Selected
          </h3>
          <p className="text-gray-500 text-center">
            Select a part from the Parts Master tab to analyze its costs
          </p>
        </CardContent>
      </Card>
    );
  }

  const materialCost = costRollup ? costRollup.rolledUpCost - selectedPart.stdCost : 0;
  const costBreakdown = costRollup ? [
    { label: 'Part Cost', value: selectedPart.stdCost, color: 'bg-blue-500' },
    { label: 'Material Cost', value: materialCost, color: 'bg-green-500' }
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card data-testid="card-cost-analysis-header">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Cost Analysis: {selectedPart.sku}
          </CardTitle>
          <CardDescription>
            {selectedPart.name} - Comprehensive cost breakdown and trend analysis
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Overview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cost Summary */}
          <Card data-testid="card-cost-summary">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Cost Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingCost ? (
                <div className="text-center py-8" data-testid="loading-cost-analysis">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Calculating costs...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600" data-testid="text-part-cost">
                      ${selectedPart.stdCost.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Part Cost</div>
                  </div>
                  
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600" data-testid="text-material-cost">
                      ${materialCost.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Material Cost</div>
                  </div>
                  
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600" data-testid="text-total-cost">
                      ${costRollup?.rolledUpCost.toFixed(2) || '0.00'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Rolled Cost</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card data-testid="card-cost-breakdown">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {costRollup ? (
                <div className="space-y-4">
                  {costBreakdown.map((item, index) => {
                    const percentage = costRollup.rolledUpCost > 0 ? (item.value / costRollup.rolledUpCost) * 100 : 0;
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-medium" data-testid={`text-breakdown-value-${index}`}>
                              ${item.value.toFixed(2)}
                            </span>
                            <span className="text-sm text-gray-500 ml-2" data-testid={`text-breakdown-percent-${index}`}>
                              ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  No cost breakdown available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost History */}
          <Card data-testid="card-cost-history">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Cost History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {costHistory && costHistory.length > 0 ? (
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {costHistory.map((entry: any, index: number) => (
                      <div 
                        key={entry.id} 
                        className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-md"
                        data-testid={`cost-history-entry-${index}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-lg" data-testid={`text-new-cost-${index}`}>
                              ${entry.newCost.toFixed(2)}
                            </span>
                            {entry.oldCost && (
                              <>
                                <span className="text-gray-400">←</span>
                                <span className="text-gray-500" data-testid={`text-old-cost-${index}`}>
                                  ${entry.oldCost.toFixed(2)}
                                </span>
                                <Badge 
                                  variant={entry.newCost > entry.oldCost ? "destructive" : "default"}
                                  className="text-xs"
                                >
                                  {entry.newCost > entry.oldCost ? '+' : ''}
                                  ${(entry.newCost - entry.oldCost).toFixed(2)}
                                </Badge>
                              </>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400" data-testid={`text-change-reason-${index}`}>
                            {entry.changeReason}
                          </div>
                          {entry.sourceReference && (
                            <div className="text-xs text-gray-500" data-testid={`text-source-ref-${index}`}>
                              Ref: {entry.sourceReference}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500" data-testid={`text-effective-date-${index}`}>
                            {new Date(entry.effectiveDate).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            by {entry.createdBy}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No cost history available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cost Analytics */}
        <div className="space-y-4">
          {/* Quick Stats */}
          <Card data-testid="card-quick-stats">
            <CardHeader>
              <CardTitle className="text-sm">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Part Type:</span>
                  <Badge variant="secondary" data-testid="badge-part-type">
                    {selectedPart.type}
                  </Badge>
                </div>
                
                {costRollup && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Material Ratio:</span>
                      <span className="font-medium" data-testid="text-material-ratio">
                        {costRollup.rolledUpCost > 0 
                          ? ((materialCost / costRollup.rolledUpCost) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Cost Complexity:</span>
                      <Badge 
                        variant={materialCost > selectedPart.stdCost ? "default" : "secondary"}
                        data-testid="badge-cost-complexity"
                      >
                        {materialCost > selectedPart.stdCost ? 'Assembly' : 'Simple'}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Last Calculated:</span>
                      <span className="text-xs text-gray-500" data-testid="text-last-calculated">
                        {new Date(costRollup.calculatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cost Alerts */}
          <Card data-testid="card-cost-alerts">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Cost Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {costHistory && costHistory.length >= 2 && (() => {
                  const recent = costHistory[0];
                  const previous = costHistory[1];
                  const changePercent = ((recent.newCost - previous.newCost) / previous.newCost) * 100;
                  
                  if (Math.abs(changePercent) > 10) {
                    return (
                      <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                          <div className="text-xs text-yellow-700 dark:text-yellow-300">
                            <strong>Large Cost Change:</strong> {changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}% 
                            change in recent update
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {costRollup && materialCost > selectedPart.stdCost * 5 && (
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5" />
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>High Material Ratio:</strong> Material costs are significantly higher than part cost
                      </div>
                    </div>
                  </div>
                )}

                {selectedPart.stdCost === 0 && (
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                      <div className="text-xs text-red-700 dark:text-red-300">
                        <strong>Zero Cost:</strong> Part has no standard cost assigned
                      </div>
                    </div>
                  </div>
                )}

                {/* If no alerts */}
                {(!costHistory || costHistory.length < 2) && 
                 selectedPart.stdCost > 0 && 
                 (!costRollup || materialCost <= selectedPart.stdCost * 5) && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No cost alerts at this time
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card data-testid="card-cost-actions">
            <CardHeader>
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  data-testid="button-recalculate-cost"
                >
                  <Calculator className="h-3 w-3 mr-2" />
                  Recalculate Costs
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  data-testid="button-export-analysis"
                >
                  <BarChart3 className="h-3 w-3 mr-2" />
                  Export Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, DollarSign, Users, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function POSuggestionsCard() {
  const { data: suggestions = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/enhanced/po/suggestions'],
    queryFn: () => apiRequest('/api/enhanced/po/suggestions')
  });

  const handleCreatePO = (suggestion: any) => {
    // For now, provide guidance to user on manual PO creation
    toast.info(`Review suggestion for ${suggestion.partId}. Use Purchase Orders page to create PO manually with vendor ${suggestion.preferredVendor?.vendorName || 'TBD'}`);
  };

  const totalEstimatedCost = suggestions.reduce((sum: number, s: any) => sum + (s.estimatedCost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Purchase Order Suggestions</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Auto-generated purchase order recommendations based on MRP
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          data-testid="button-refresh-po-suggestions"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{suggestions.length}</div>
              <div className="text-sm text-gray-600">Suggested Orders</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${totalEstimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">Total Estimated Cost</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            Purchase Recommendations
          </CardTitle>
          <CardDescription>
            Based on current shortages and reorder points
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading suggestions...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{suggestion.partId}</div>
                      <div className="text-sm text-gray-600">
                        Suggested Qty: {suggestion.suggestedQty?.toLocaleString() || 'N/A'}
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">
                      Recommended
                    </Badge>
                  </div>

                  {suggestion.preferredVendor && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-gray-400" />
                        <span>{suggestion.preferredVendor.vendorName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-gray-400" />
                        <span>${suggestion.estimatedCost?.toFixed(2) || 'N/A'}</span>
                      </div>
                      <div className="text-gray-600">
                        Part #: {suggestion.preferredVendor.vendorPartNumber}
                      </div>
                      <div className="text-gray-600">
                        Lead: {suggestion.preferredVendor.leadTimeDays || 'N/A'} days
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCreatePO(suggestion)}
                      data-testid={`button-review-po-${suggestion.partId}`}
                    >
                      <ShoppingCart className="h-3 w-3 mr-1" />
                      Review Suggestion
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No purchase order suggestions at this time</p>
              <p className="text-xs text-gray-400 mt-1">Run MRP calculation to generate suggestions</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}